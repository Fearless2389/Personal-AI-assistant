// Pure email helpers for gmailService.js: building outgoing messages safely and
// reading incoming ones as plain text. No I/O — tested in emailFormat.test.js.

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/**
 * A header value with no line breaks or control characters. Without this a
 * subject like "Hi\r\nBcc: someone@x.com" would add a hidden recipient (header
 * injection) — and subjects can come from the model, which reads untrusted email.
 */
export function cleanHeader(value) {
  return String(value ?? '')
    .replace(/[\r\n\t\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "a@x.com, Priya <p@y.in>; bad" → { valid: ['a@x.com', 'p@y.in'], invalid: ['bad'] } */
export function parseRecipients(to) {
  const parts = cleanHeader(Array.isArray(to) ? to.join(',') : to)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = [];
  const invalid = [];
  for (const part of parts) {
    const address = (part.match(/<([^>]+)>\s*$/)?.[1] ?? part).trim();
    (EMAIL.test(address) ? valid : invalid).push(EMAIL.test(address) ? address.toLowerCase() : part);
  }
  return { valid: [...new Set(valid)], invalid };
}

export const replySubject = (subject) => {
  const s = cleanHeader(subject);
  return /^re:/i.test(s) ? s : `Re: ${s}`;
};

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/**
 * RFC 2822 message → base64url, as the Gmail API wants in `raw`.
 * `to` must already be validated addresses. Body is UTF-8 plain text.
 */
export function buildRawEmail({ to, subject, body, inReplyTo = null, references = null }) {
  const headers = [
    `To: ${to.map(cleanHeader).join(', ')}`,
    `Subject: ${encodeWord(cleanHeader(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64'
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${cleanHeader(inReplyTo)}`);
  if (references) headers.push(`References: ${cleanHeader(references)}`);
  const message = `${headers.join('\r\n')}\r\n\r\n${b64(String(body ?? '')).replace(/.{76}/g, '$&\r\n')}`;
  return Buffer.from(message, 'utf8').toString('base64url');
}

export const headerOf = (headers, name) =>
  (headers ?? []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

const decodePart = (data) => (data ? Buffer.from(data, 'base64url').toString('utf8') : '');

export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/** The readable text of a Gmail message payload: text/plain first, else stripped HTML. */
export function extractBody(payload) {
  const parts = [];
  const walk = (p) => {
    if (!p) return;
    parts.push(p);
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);
  const plain = parts.find((p) => p.mimeType === 'text/plain' && p.body?.data);
  if (plain) return decodePart(plain.body.data).trim();
  const html = parts.find((p) => p.mimeType === 'text/html' && p.body?.data);
  return html ? htmlToText(decodePart(html.body.data)) : '';
}

/**
 * Third-party text on its way to the model: drop invisible characters (zero-width,
 * bidi overrides — used to hide instructions) and cap the length.
 */
export function asUntrusted(text, max = 6000) {
  const clean = String(text ?? '').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '');
  return clean.length > max ? `${clean.slice(0, max)}\n…[truncated]` : clean;
}
