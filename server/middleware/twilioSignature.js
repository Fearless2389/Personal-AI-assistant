// Validate the X-Twilio-Signature header on inbound webhooks.
// Twilio signs HMAC-SHA1( authToken, fullUrl + sorted(paramKey+paramValue) ).
// If TWILIO_AUTH_TOKEN is unset (local dev), we pass through so the webhook is testable.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function validateTwilioSignature(req, res, next) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return next(); // not configured → allow (dev)

  const signature = req.headers['x-twilio-signature'];
  if (!signature) return res.status(403).send('Missing signature');

  // Reconstruct the exact public URL Twilio used. Behind a proxy, set PUBLIC_BASE_URL.
  const base = process.env.PUBLIC_BASE_URL
    ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
    : `https://${req.headers.host}`;
  const url = base + req.originalUrl;

  const params = req.body || {};
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    if (a.length === b.length && timingSafeEqual(a, b)) return next();
  } catch { /* fall through */ }
  return res.status(403).send('Invalid signature');
}
