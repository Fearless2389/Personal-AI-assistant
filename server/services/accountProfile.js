// What the assistant knows about Rama's own setup: their email addresses and which
// services are ready. Without this the assistant can read Gmail but doesn't know
// whose Gmail it is ("send it to me" → "what's your email?").
// The Google address is looked up from the connected account (cached per process);
// accountBlock() renders it for the system prompt and is pure (accountProfile.test.js).
import { google } from 'googleapis';
import { supabaseAdmin } from './supabase.js';
import { getAuthorizedClient } from './googleAuth.js';
import { isSmsConfigured } from './sms.js';

const TTL_MS = 10 * 60_000;
const googleEmails = new Map(); // userId → { at, email }

/** Forget the cached address (call after connecting or disconnecting Google). */
export function forgetGoogleAccount(userId) {
  googleEmails.delete(userId);
}

/** The connected Google account's address: Gmail profile, else the primary calendar's id. */
async function connectedGoogleEmail(userId) {
  const hit = googleEmails.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.email;
  let email = null;
  try {
    const auth = await getAuthorizedClient(userId);
    email = await google
      .gmail({ version: 'v1', auth })
      .users.getProfile({ userId: 'me' })
      .then((r) => r.data.emailAddress)
      .catch(() =>
        google
          .calendar({ version: 'v3', auth })
          .calendarList.get({ calendarId: 'primary' })
          .then((r) => r.data.id)
      );
  } catch (err) {
    console.warn('[account] could not read the Google address:', err.message);
  }
  googleEmails.set(userId, { at: Date.now(), email: email ?? null });
  return email ?? null;
}

/**
 * settings: the user_settings row (google_connection_status, phone_number, sms_opt_in).
 * → { googleEmail, loginEmail, googleStatus, smsReady }
 */
export async function loadAccount(userId, settings) {
  const googleStatus = settings?.google_connection_status ?? 'disconnected';
  const [googleEmail, loginEmail] = await Promise.all([
    googleStatus === 'connected' ? connectedGoogleEmail(userId) : null,
    supabaseAdmin.auth.admin
      .getUserById(userId)
      .then((r) => r.data?.user?.email ?? null)
      .catch(() => null)
  ]);
  return {
    googleEmail,
    loginEmail,
    googleStatus,
    smsReady: isSmsConfigured() && Boolean(settings?.phone_number) && settings?.sms_opt_in !== false
  };
}

/** Prompt lines describing the account. Pure. */
export function accountBlock({ googleEmail, loginEmail, googleStatus, smsReady } = {}) {
  const own = googleEmail || loginEmail;
  const lines = [];
  if (own) {
    lines.push(
      `- Rama's own email: ${own}. "Email myself", "send it to me", "my address" → use this; never ask for it.`
    );
  }
  if (loginEmail && googleEmail && loginEmail.toLowerCase() !== googleEmail.toLowerCase()) {
    lines.push(`- Rama signs in to Nexus as ${loginEmail}; Gmail and Calendar use ${googleEmail}.`);
  }
  lines.push(
    googleStatus === 'connected'
      ? `- Google (Gmail + Calendar) is connected${googleEmail ? ` as ${googleEmail}` : ''}.`
      : `- Google is ${googleStatus === 'broken' ? 'disconnected (expired)' : 'not connected'}: Gmail and Calendar tools will fail — tell Rama to connect on the Calendar page.`
  );
  lines.push(
    smsReady
      ? '- SMS reminders are set up.'
      : '- SMS reminders are not set up (needs a phone number in Settings and Twilio on the server) — say so before scheduling one.'
  );
  return lines.join('\n');
}
