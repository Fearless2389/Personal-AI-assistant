// Google account access shared by Calendar and Gmail: encrypted token storage,
// an authorized OAuth2 client per user (silent refreshes persisted), transient-error
// retry, and one mapping from googleapis errors to stable app errors:
//   not_connected · connection_broken (invalid_grant: tokens cleared) ·
//   needs_reconnect (connected before a permission was added, e.g. Gmail) ·
//   api_disabled (the API is off in the Cloud project) · rate_limited · forbidden · not_found
import { supabaseAdmin } from './supabase.js';
import { buildOAuthClient } from './googleOAuth.js';
import { encrypt, decrypt } from './crypto.js';

/** In-flight authorized client builds, deduped per user. */
const inFlight = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Read encrypted tokens out of user_settings and decrypt them.
 * Returns null when the user has never connected.
 */
export async function loadTokens(userId) {
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
export async function saveTokens(userId, { access_token, refresh_token, expiry_date }) {
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
    google_token_expires_at:
      expiry_date != null ? new Date(expiry_date).toISOString() : (existing?.google_token_expires_at ?? null)
  };

  // Upsert in case the user_settings row does not yet exist for this user.
  const { error } = await supabaseAdmin.from('user_settings').upsert({ id: userId, ...next }, { onConflict: 'id' });
  if (error) throw error;
}

/**
 * Mark a user's Google connection as broken (invalid_grant). Clears tokens so
 * we don't keep trying to use them; UI banner picks this up via /status.
 */
export async function markConnectionBroken(userId) {
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
export async function getAuthorizedClient(userId) {
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
      }).catch((err) => console.error(`[google:${userId}] token persist failed:`, err.message));
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
export async function mapGoogleError(userId, err) {
  const status = err?.response?.status ?? err?.code;
  const reason = err?.errors?.[0]?.reason ?? err?.response?.data?.error;

  if (status === 401 || reason === 'invalid_grant') {
    await markConnectionBroken(userId);
    return Object.assign(new Error('connection_broken'), { status: 409 });
  }
  if (status === 429 || reason === 'userRateLimitExceeded' || reason === 'rateLimitExceeded') {
    return Object.assign(new Error('rate_limited'), { status: 429, retryAfter: 30 });
  }
  if (
    status === 403 &&
    (reason === 'insufficientPermissions' ||
      /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(err?.message ?? ''))
  ) {
    return Object.assign(new Error('needs_reconnect'), { status: 409 });
  }
  // The API itself is switched off for the Cloud project (e.g. Gmail API not enabled).
  if (
    status === 403 &&
    (reason === 'accessNotConfigured' || /has not been used in project|is disabled/i.test(err?.message ?? ''))
  ) {
    return Object.assign(new Error('api_disabled'), { status: 503 });
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
export async function withRetry(fn) {
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
