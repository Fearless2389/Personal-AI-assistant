import { google } from 'googleapis';
import { supabaseAdmin } from './supabase.js';
import { buildOAuthClient } from './googleOAuth.js';
import {
  loadTokens,
  saveTokens,
  getAuthorizedClient,
  mapGoogleError,
  withRetry,
  markConnectionBroken as markGoogleBroken
} from './googleAuth.js';
import { getListCache, setListCache, invalidateListCache, getIdem, setIdem } from './eventCache.js';
import { DEFAULT_TZ, dayRangeUtc } from './time.js';

/** Mark the Google connection broken and drop this user's cached event lists. */
export async function markConnectionBroken(userId) {
  invalidateListCache(userId);
  await markGoogleBroken(userId);
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
    const resp = await withRetry(() =>
      calendar.events.list({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        timeMin: _timeMin,
        timeMax: _timeMax,
        maxResults: 50
      })
    );
    const events = (resp.data?.items ?? []).map(normalizeEvent);
    setListCache(userId, cacheKey, events);
    return events;
  } catch (err) {
    throw await mapGoogleError(userId, err);
  }
}

/**
 * Convenience: today 00:00 → 23:59 in the user's timezone (not the server's).
 */
export async function listTodaysEvents(userId, tz = DEFAULT_TZ) {
  const { startIso, endIso } = dayRangeUtc(tz); // the user's local day, not the server's
  return listEvents(userId, { timeMin: startIso, timeMax: endIso });
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
    const resp = await withRetry(() =>
      calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: title,
          description,
          location,
          start: { dateTime: new Date(start_time).toISOString() },
          end: { dateTime: new Date(end_time).toISOString() }
        }
      })
    );
    invalidateListCache(userId);
    const normalized = normalizeEvent(resp.data);
    if (idempotencyKey) setIdem(userId, idempotencyKey, normalized);
    return normalized;
  } catch (err) {
    throw await mapGoogleError(userId, err);
  }
}

/** Calendar API client for one user (authorized, refresh-aware). */
async function calendarFor(userId) {
  return google.calendar({ version: 'v3', auth: await getAuthorizedClient(userId) });
}

/**
 * Change an event: any of title, start_time, end_time, description, location.
 * Also updates the local calendar_events mirror (used by semantic memory).
 */
export async function updateEvent(userId, eventId, { title, start_time, end_time, description, location } = {}) {
  const requestBody = {};
  if (title) requestBody.summary = title;
  if (description != null) requestBody.description = description;
  if (location != null) requestBody.location = location;
  if (start_time) requestBody.start = { dateTime: new Date(start_time).toISOString() };
  if (end_time) requestBody.end = { dateTime: new Date(end_time).toISOString() };
  try {
    const calendar = await calendarFor(userId);
    const resp = await withRetry(() => calendar.events.patch({ calendarId: 'primary', eventId, requestBody }));
    invalidateListCache(userId);
    const event = normalizeEvent(resp.data);
    await supabaseAdmin
      .from('calendar_events')
      .update({
        title: event.title,
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location,
        description: event.description
      })
      .eq('user_id', userId)
      .eq('google_event_id', eventId);
    return event;
  } catch (err) {
    throw await mapGoogleError(userId, err);
  }
}

/** Delete an event from the primary calendar (and its local mirror row). */
export async function deleteEvent(userId, eventId) {
  try {
    const calendar = await calendarFor(userId);
    await withRetry(() => calendar.events.delete({ calendarId: 'primary', eventId }));
    invalidateListCache(userId);
    await supabaseAdmin.from('calendar_events').delete().eq('user_id', userId).eq('google_event_id', eventId);
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
      await client
        .revokeToken(tokens.refresh_token)
        .catch((err) => console.warn(`[calendar:${userId}] revoke failed (continuing):`, err.message));
    }
  } catch {
    /* loadTokens may throw if already disconnected — fine */
  }

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
  await supabaseAdmin.from('user_settings').upsert(
    {
      id: userId,
      google_connection_status: 'connected',
      last_connected_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );
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
