// Gmail for the assistant: search, read, draft, send. Auth, retries and error
// mapping come from googleAuth.js (shared with Calendar). Message building and
// parsing are pure helpers in emailFormat.js. Everything read from email is
// third-party content: it's returned marked untrusted, never as instructions.
import { google } from 'googleapis';
import { getAuthorizedClient, mapGoogleError, withRetry } from './googleAuth.js';
import {
  parseRecipients,
  replySubject,
  buildRawEmail,
  headerOf,
  extractBody,
  asUntrusted,
  cleanHeader
} from './emailFormat.js';

const MAX_RESULTS = 10;

async function gmailFor(userId) {
  return google.gmail({ version: 'v1', auth: await getAuthorizedClient(userId) });
}

async function call(userId, fn) {
  try {
    return await fn(await gmailFor(userId));
  } catch (err) {
    throw await mapGoogleError(userId, err);
  }
}

const summaryOf = (m) => {
  const h = m.payload?.headers;
  return {
    id: m.id,
    thread_id: m.threadId,
    from: asUntrusted(headerOf(h, 'From'), 200),
    subject: asUntrusted(headerOf(h, 'Subject'), 300),
    date: headerOf(h, 'Date'),
    snippet: asUntrusted(m.snippet ?? '', 300),
    unread: (m.labelIds ?? []).includes('UNREAD')
  };
};

/** Gmail search syntax ("from:amazon newer_than:7d"). Newest first, metadata only. */
export async function searchEmail(userId, { query = '', max = 8 } = {}) {
  return call(userId, async (gmail) => {
    const list = await withRetry(() =>
      gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(Math.max(Number(max) || 8, 1), MAX_RESULTS)
      })
    );
    const ids = (list.data.messages ?? []).map((m) => m.id);
    const messages = await Promise.all(
      ids.map((id) =>
        withRetry(() =>
          gmail.users.messages.get({
            userId: 'me',
            id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date']
          })
        )
      )
    );
    return messages.map((r) => summaryOf(r.data));
  });
}

/** One message as plain text (headers + body), capped. */
export async function readEmail(userId, id) {
  return call(userId, async (gmail) => {
    const { data } = await withRetry(() => gmail.users.messages.get({ userId: 'me', id, format: 'full' }));
    const h = data.payload?.headers;
    return {
      ...summaryOf(data),
      to: asUntrusted(headerOf(h, 'To'), 300),
      body: asUntrusted(extractBody(data.payload))
    };
  });
}

/**
 * Validate and assemble an outgoing message. For a reply, threads it under the
 * original (In-Reply-To/References, "Re:" subject) and defaults `to` to the sender.
 * → { message: { raw, threadId? }, to, subject } or throws { status: 400 }.
 */
async function compose(gmail, { to, subject, body, reply_to_id }) {
  let inReplyTo = null;
  let references = null;
  let threadId;
  let replyTo = null;
  if (reply_to_id) {
    const { data } = await withRetry(() =>
      gmail.users.messages.get({
        userId: 'me',
        id: reply_to_id,
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'References', 'Subject', 'From', 'Reply-To']
      })
    );
    const h = data.payload?.headers;
    inReplyTo = headerOf(h, 'Message-ID') || null;
    references = [headerOf(h, 'References'), inReplyTo].filter(Boolean).join(' ') || null;
    threadId = data.threadId;
    subject = subject || replySubject(headerOf(h, 'Subject'));
    replyTo = headerOf(h, 'Reply-To') || headerOf(h, 'From');
  }
  const { valid, invalid } = parseRecipients(to || replyTo);
  if (!valid.length || invalid.length) {
    throw Object.assign(new Error(`Invalid recipient: ${invalid.join(', ') || '(none)'}`), { status: 400 });
  }
  if (!String(body ?? '').trim()) throw Object.assign(new Error('The email body is empty.'), { status: 400 });
  const cleanSubject = cleanHeader(subject) || '(no subject)';
  return {
    to: valid,
    subject: cleanSubject,
    message: { raw: buildRawEmail({ to: valid, subject: cleanSubject, body, inReplyTo, references }), threadId }
  };
}

/** Save to Drafts (nothing leaves the account). */
export async function createDraft(userId, args) {
  return call(userId, async (gmail) => {
    const c = await compose(gmail, args);
    const { data } = await withRetry(() =>
      gmail.users.drafts.create({ userId: 'me', requestBody: { message: c.message } })
    );
    return { draft_id: data.id, to: c.to, subject: c.subject };
  });
}

/** Send now. Reached only through the confirmation gate. Not retried: a retry could double-send. */
export async function sendEmail(userId, args) {
  return call(userId, async (gmail) => {
    const c = await compose(gmail, args);
    const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: c.message });
    return { message_id: data.id, thread_id: data.threadId, to: c.to, subject: c.subject };
  });
}

/** Validate a send before it is parked, so the readback shows the real recipients. */
export function previewSend({ to, subject, body }) {
  const { valid, invalid } = parseRecipients(to);
  return { to: valid, invalid, subject: cleanHeader(subject), body: String(body ?? '') };
}
