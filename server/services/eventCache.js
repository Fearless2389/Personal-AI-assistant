const LIST_DEFAULT_TTL_MS = 60_000;
const IDEM_DEFAULT_TTL_MS = 10 * 60_000;

const listCache = new Map();
const idemCache = new Map();

function k(userId, key) {
  return `${userId}::${key}`;
}

function getFrom(map, userId, key) {
  const entry = map.get(k(userId, key));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(k(userId, key));
    return null;
  }
  return entry.value;
}

function setIn(map, userId, key, value, ttlMs) {
  map.set(k(userId, key), { value, expiresAt: Date.now() + ttlMs });
}

export function getListCache(userId, key) {
  return getFrom(listCache, userId, key);
}
export function setListCache(userId, key, value, ttlMs = LIST_DEFAULT_TTL_MS) {
  setIn(listCache, userId, key, value, ttlMs);
}
export function invalidateListCache(userId) {
  const prefix = `${userId}::`;
  for (const key of listCache.keys()) {
    if (key.startsWith(prefix)) listCache.delete(key);
  }
}

export function getIdem(userId, key) {
  return getFrom(idemCache, userId, key);
}
export function setIdem(userId, key, value, ttlMs = IDEM_DEFAULT_TTL_MS) {
  setIn(idemCache, userId, key, value, ttlMs);
}

const sweep = setInterval(() => {
  const now = Date.now();
  for (const map of [listCache, idemCache]) {
    for (const [k2, v] of map) if (v.expiresAt <= now) map.delete(k2);
  }
}, 60_000);
sweep.unref?.();
