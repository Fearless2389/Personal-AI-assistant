import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import cookie from 'cookie';
import { requireAuth } from '../middleware/auth.js';
import { buildOAuthClient, SCOPES } from '../services/googleOAuth.js';
import { signState, verifyState } from '../services/stateCookie.js';
import * as calendarService from '../services/calendarService.js';

const router = Router();
const STATE_COOKIE = 'nx_oauth_state';
const COOKIE_PATH = '/api/calendar';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function setStateCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(STATE_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: COOKIE_PATH,
      maxAge: 600,
      secure: process.env.NODE_ENV === 'production'
    })
  );
}

function clearStateCookie(res) {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(STATE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: COOKIE_PATH,
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production'
    })
  );
}

function clientHome() {
  return (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
}

/* ──────────────────────────────────────────────────────────────
 *  GET /api/calendar/status
 * ────────────────────────────────────────────────────────────── */
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    res.json(await calendarService.getStatus(req.user.id));
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────────
 *  GET /api/calendar/connect
 *  Generates PKCE pair + signed state cookie, returns Google consent URL.
 * ────────────────────────────────────────────────────────────── */
router.get('/connect', requireAuth, async (req, res, next) => {
  try {
    const oauth2 = buildOAuthClient();
    const codeVerifier = b64url(randomBytes(32));
    const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());
    const stateToken = signState({ userId: req.user.id, codeVerifier });
    const nonceState = b64url(randomBytes(8));

    setStateCookie(res, stateToken);

    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: nonceState
    });

    res.json({ url });
  } catch (err) {
    console.error(`[calendar:${req.id}] connect failed:`, err.message);
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────────
 *  GET /api/calendar/callback
 *  Google redirects here with ?code=&state=. We authenticate the user via
 *  the signed state cookie (Google strips Authorization headers).
 * ────────────────────────────────────────────────────────────── */
router.get('/callback', async (req, res) => {
  const failRedirect = (reason) => res.redirect(`${clientHome()}/calendar?error=${encodeURIComponent(reason)}`);
  try {
    const cookies = cookie.parse(req.headers.cookie ?? '');
    const stateRaw = cookies[STATE_COOKIE];
    if (!stateRaw) return failRedirect('missing_state');

    let parsed;
    try {
      parsed = verifyState(stateRaw);
    } catch (e) {
      console.warn(`[calendar:${req.id}] state verify failed:`, e.message);
      return failRedirect('state_invalid');
    }
    const { userId, codeVerifier } = parsed;

    const code = String(req.query.code ?? '');
    if (!code) return failRedirect('missing_code');

    const oauth2 = buildOAuthClient();
    const { tokens } = await oauth2.getToken({ code, codeVerifier });

    await calendarService.completeConnect(userId, {
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expiry_date: tokens.expiry_date ?? null
    });

    clearStateCookie(res);
    return res.redirect(`${clientHome()}/calendar?connected=1`);
  } catch (err) {
    console.error(`[calendar:${req.id}] callback failed:`, err.message);
    return failRedirect('exchange_failed');
  }
});

/* ──────────────────────────────────────────────────────────────
 *  POST /api/calendar/disconnect
 * ────────────────────────────────────────────────────────────── */
router.post('/disconnect', requireAuth, async (req, res, next) => {
  try {
    await calendarService.disconnect(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ──────────────────────────────────────────────────────────────
 *  GET /api/calendar/events?timeMin=&timeMax=
 * ────────────────────────────────────────────────────────────── */
router.get('/events', requireAuth, async (req, res) => {
  try {
    const events = await calendarService.listEvents(req.user.id, {
      timeMin: req.query.timeMin,
      timeMax: req.query.timeMax
    });
    res.json({ events });
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 429) res.setHeader('Retry-After', String(err.retryAfter ?? 30));
    const body =
      err.message === 'connection_broken'
        ? { error: 'reconnect_required' }
        : err.message === 'rate_limited'
          ? { error: 'rate_limited' }
          : err.message === 'not_connected'
            ? { error: 'not_connected' }
            : { error: err.message ?? 'list_failed' };
    console.error(`[calendar:${req.id}] list failed:`, err.message);
    res.status(status).json(body);
  }
});

/* ──────────────────────────────────────────────────────────────
 *  POST /api/calendar/events
 * ────────────────────────────────────────────────────────────── */
router.post('/events', requireAuth, async (req, res) => {
  try {
    const idempotencyKey = String(req.headers['x-idempotency-key'] ?? '') || undefined;
    const created = await calendarService.createEvent(req.user.id, req.body ?? {}, { idempotencyKey });
    res.json({ event: created });
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 429) res.setHeader('Retry-After', String(err.retryAfter ?? 30));
    console.error(`[calendar:${req.id}] create failed:`, err.message);
    res.status(status).json({ error: err.message ?? 'create_failed' });
  }
});

export default router;
