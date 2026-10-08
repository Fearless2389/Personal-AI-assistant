import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = 'v1';

function loadKey() {
  const raw = process.env.NEXUS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'NEXUS_ENCRYPTION_KEY is not set. Generate one with: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  let key;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('NEXUS_ENCRYPTION_KEY must be base64-encoded');
  }
  if (key.length !== 32) {
    throw new Error(`NEXUS_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}).`);
  }
  return key;
}

let cachedKey = null;
function key() {
  if (cachedKey === null) cachedKey = loadKey();
  return cachedKey;
}

export function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decrypt(packed) {
  if (packed == null) return null;
  const parts = String(packed).split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('crypto: invalid packed ciphertext format');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (iv.length !== IV_LEN) throw new Error('crypto: bad IV length');
  if (tag.length !== TAG_LEN) throw new Error('crypto: bad auth tag length');
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
