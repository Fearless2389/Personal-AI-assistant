import { google } from 'googleapis';
import { supabaseAdmin } from './supabase.js';
import { buildOAuthClient } from './googleOAuth.js';
import { encrypt, decrypt } from './crypto.js';
import {
  getListCache, setListCache, invalidateListCache,
  getIdem, setIdem
} from './eventCache.js';

/** In-flight authorized client builds, deduped per user. */
const inFlight = new Map();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Read encrypted tokens out of user_settings and decrypt them.
 * Returns null when the user has never connected.
 */
async function loadTokens(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('google_access_token, google_refresh_token, google_token_expires_at, google_connection_status')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.google_connection_status !== 'connected') return null;
  if (!data.google_refresh_token) return null;

  return {
    access_token: data.google_access_token ? decrypt(data.google_access_token) : null,
    refresh_token: decrypt(data.google_refresh_token),
    expiry_date: data.google_token_expires_at ? new Date(data.google_token_expires_at).getTime() : null
  };
}

/**
 * Persist (some or all of) the credential triple. Non-null fields are encrypted
 * before write; nulls are left untouched on the existing row.
 */
async function saveTokens(userId, { access_token, refresh_token, expiry_date }) {
  // Read current row to merge missing fields (especially refresh_token, which Google
  // omits from rotation events when it has not changed).
  const { data: existing } = await supabaseAdmin
    .from('user_settings')
    .select('google_access_token, google_refresh_token, google_token_expires_at')
    .eq('id', userId)
    .maybeSingle();

  const next = {
    google_access_token: access_token != null ? encrypt(access_token) : (existing?.google_access_token ?? null),
    google_refresh_token: refresh_token != null ? encrypt(refresh_token) : (existing?.google_refresh_token ?? null),
    google_token_expires_at: expiry_date != null
      ? new Date(expiry_date).toISOString()
      : (existing?.google_token_expires_at ?? null)
  };

  // Upsert in case the user_settings row does not yet exist for this user.
  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert({ id: userId, ...next }, { onConflict: 'id' });
  if (error) throw error;
}

/**
 * Mark a user's Google connection as broken (invalid_grant). Clears tokens so
 * we don't keep trying to use them; UI banner picks this up via /status.
 */
export async function markConnectionBroken(userId) {
  invalidateListCache(userId);
  await supabaseAdmin
    .from('user_settings')
    .update({
      google_access_token: null,
      google_refresh_token: null,
      google_token_expires_at: null,
      google_connection_status: 'broken'
    })
    .eq('id', userId);
}

/**
 * Build (or reuse an in-flight build of) an authorized OAuth2 client for this user.
 * Wires the 'tokens' listener so silent refreshes get persisted.
 */
async function getAuthorizedClient(userId) {
  const existing = inFlight.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    const tokens = await loadTokens(userId);
    if (!tokens) {
      throw Object.assign(new Error('not_connected'), { status: 409 });
    }
    const client = buildOAuthClient();
    client.setCredentials(tokens);
    client.on('tokens', (rotated) => {
      // googleapis fires this on silent refresh. Persist whatever was rotated.
      saveTokens(userId, {
        access_token: rotated.access_token ?? null,
        refresh_token: rotated.refresh_token ?? null,
        expiry_date: rotated.expiry_date ?? null
      }).catch((err) => console.error(`[calendar:${userId}] token persist failed:`, err.message));
    });
    return client;
  })();

  inFlight.set(userId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(userId);
  }
}

/**
 * Map a googleapis error into a stable, app-level shape with a status hint.
 * Side effect: invalid_grant flips the user's connection to 'broken'.
 */
async function mapGoogleError(userId, err) {
  const status = err?.response?.status ?? err?.code;
  const reason = err?.errors?.[0]?.reason ?? err?.response?.data?.error;

  if (status === 401 || reason === 'invalid_grant') {
    await markConnectionBroken(userId);
    return Object.assign(new Error('connection_broken'), { status: 409 });
  }
  if (status === 429 || reason === 'userRateLimitExceeded' || reason === 'rateLimitExceeded') {
    return Object.assign(new Error('rate_limited'), { status: 429, retryAfter: 30 });
  }
  if (status === 403 && reason === 'forbidden') {
    return Object.assign(new Error('forbidden'), { status: 403 });
  }
  if (status === 404) return Object.assign(new Error('not_found'), { status: 404 });

  const wrapped = new Error(err?.message ?? 'google_call_failed');
  wrapped.status = 502;
  wrapped.cause = err;
  return wrapped;
}

/**
 * 2-attempt jittered retry — only on transient 5xx. Other failures bubble immediately.
 */
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    const status = err?.response?.status ?? err?.code;
    if (status >= 500 && status < 600) {
      await sleep(300 + Math.floor(Math.random() * 200));
      return await fn();
    }
    throw err;
  }
}

function normalizeEvent(e) {
  const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : null);
  const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T23:59:59` : null);
  return {
    google_event_id: e.id,
    title: e.summary ?? '(no title)',
    description: e.description ?? null,
    start_time: start,
    end_time: end,
    location: e.location ?? null,
    html_link: e.htmlLink ?? null,
    all_day: Boolean(e.start?.date)
  };
}

/**
 * List events between timeMin and timeMax for the user's primary calendar.
 * Backed by a 60-second per-user in-process cache.
 */
export async function listEvents(userId, { timeMin, timeMax } = {}) {
  const _timeMin = timeMin ?? new Date().toISOString();
  const _timeMax = timeMax ?? new Date(Date.now() + 14 * 24 * 3600_000).toISOString();
  const cacheKey = `${_timeMin}|${_timeMax}`;

  const hit = getListCache(userId, cacheKey);
  if (hit) return hit;

  try {
    const client = await getAuthorizedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const resp = await withRetry(() => calendar.events.list({
      calendarId: 'primary',
      singleEvents: true,
      orderBy: 'startTime',
      timeMin: _timeMin,
      timeMax: _timeMax,
      maxResults: 50
    }));
    const events = (resp.data?.items ?? []).map(normalizeEvent);
    setListCache(userId, cacheKey, events);
    return events;
  } catch (err) {
    throw await mapGoogleError(userId, err);
  }
}

/**
 * Convenience: today 00:00 → 23:59 (server local time).
 * User-timezone-aware bucketing is deferred to a later phase.
 */
export async function listTodaysEvents(userId) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 3600_000 - 1);
  return listEvents(userId, { timeMin: start.toISOString(), timeMax: end.toISOString() });
}

/**
 * Create an event on the user's primary calendar. Idempotent when an
 * idempotencyKey is supplied — same key replays return the original result
 * without contacting Google.
 */
export async function createEvent(userId, args, { idempotencyKey } = {}) {
  const { title, start_time, end_time, description = null, location = null } = args ?? {};
  if (!title || !start_time || !end_time) {
    throw Object.assign(new Error('bad_request: title, start_time, end_time are required'), { status: 400 });
  }

  if (idempotencyKey) {
    const cached = getIdem(userId, idempotencyKey);
    if (cached) return cached;
  }

  try {
    const client = await getAuthorizedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const resp = await withRetry(() => calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        location,
        start: { dateTime: new Date(start_time).toISOString() },
        end: { dateTime: new Date(end_time).toISOString() }
      }
    }));
    invalidateListCache(userId);
    const normalized = normalizeEvent(resp.data);
    if (idempotencyKey) setIdem(userId, idempotencyKey, normalized);
    return normalized;
  } catch (err) {
    throw await mapGoogleError(userId, err);
  }
}

/**
 * Best-effort revoke at Google. Always clears local tokens regardless of outcome.
 */
export async function disconnect(userId) {
  try {
    const tokens = await loadTokens(userId);
    if (tokens?.refresh_token) {
      const client = buildOAuthClient();
      await client.revokeToken(tokens.refresh_token).catch((err) =>
        console.warn(`[calendar:${userId}] revoke failed (continuing):`, err.message)
      );
    }
  } catch { /* loadTokens may throw if already disconnected — fine */ }

  invalidateListCache(userId);
  await supabaseAdmin
    .from('user_settings')
    .update({
      google_access_token: null,
      google_refresh_token: null,
      google_token_expires_at: null,
      google_connection_status: 'disconnected'
    })
    .eq('id', userId);
}

/**
 * Persist a freshly-issued credential triple at the end of the OAuth round-trip.
 * Sets status='connected' and last_connected_at.
 */
export async function completeConnect(userId, { access_token, refresh_token, expiry_date }) {
  await saveTokens(userId, { access_token, refresh_token, expiry_date });
  await supabaseAdmin
    .from('user_settings')
    .upsert({
      id: userId,
      google_connection_status: 'connected',
      last_connected_at: new Date().toISOString()
    }, { onConflict: 'id' });
}

/**
 * Lightweight status read for the UI banner.
 */
export async function getStatus(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('google_connection_status, last_connected_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const status = data?.google_connection_status ?? 'disconnected';
  return {
    connected: status === 'connected',
    status,
    last_connected_at: data?.last_connected_at ?? null
  };
}
