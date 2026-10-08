import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const MAX_AGE_MS = 10 * 60_000;

function secret() {
  const s = process.env.NEXUS_STATE_HMAC_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'NEXUS_STATE_HMAC_SECRET must be set to a long random string (>=32 chars). ' +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function fromB64url(s) {
  return Buffer.from(s, 'base64url');
}

/**
 * Sign an OAuth state payload into an opaque, tamper-evident cookie value.
 * Format: <payloadB64Url>.<hmacB64Url>
 * Payload itself encodes: userId | codeVerifier | nonce | tsMs (pipe-separated, base64url)
 */
export function signState({ userId, codeVerifier }) {
  if (!userId || !codeVerifier) {
    throw new Error('signState: userId and codeVerifier are required');
  }
  const nonce = b64url(randomBytes(12));
  const ts = String(Date.now());
  const payload = [userId, codeVerifier, nonce, ts].join('|');
  const payloadEncoded = b64url(payload);
  const mac = createHmac('sha256', secret()).update(payloadEncoded).digest();
  return `${payloadEncoded}.${b64url(mac)}`;
}

/**
 * Verify and decode a state cookie. Throws on tamper, expiry, or bad format.
 * Returns { userId, codeVerifier }.
 */
export function verifyState(rawCookieValue) {
  if (!rawCookieValue || typeof rawCookieValue !== 'string') {
    throw new Error('stateCookie: missing');
  }
  const parts = rawCookieValue.split('.');
  if (parts.length !== 2) throw new Error('stateCookie: bad shape');
  const [payloadEncoded, macB64] = parts;

  const expected = createHmac('sha256', secret()).update(payloadEncoded).digest();
  const provided = fromB64url(macB64);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new Error('stateCookie: signature mismatch');
  }

  const decoded = fromB64url(payloadEncoded).toString('utf8');
  const [userId, codeVerifier, , tsStr] = decoded.split('|');
  if (!userId || !codeVerifier || !tsStr) throw new Error('stateCookie: malformed payload');

  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) {
    throw new Error('stateCookie: expired');
  }

  return { userId, codeVerifier };
}
