// Fetch a public web page for the assistant, safely. The URL comes from the model
// (which may have read it in an email or another page), so before connecting we
// refuse anything that isn't a public http(s) address: localhost, private LANs,
// link-local and cloud-metadata ranges (SSRF guard). Redirects are followed by hand
// and every hop is re-checked. isPublicAddress / checkUrl are pure (webFetch.test.js).
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { htmlToText } from './htmlText.js';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'Mozilla/5.0 (compatible; NexusAssistant/1.0; personal use)';

function ipv4ToInt(ip) {
  return ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}
const V4_BLOCKED = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved + broadcast
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

/** Is this IP address on the public internet? (false for loopback, private, link-local, …) */
export function isPublicAddress(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    return !V4_BLOCKED.some(([base, mask]) => (n & mask) === (base & mask));
  }
  if (v === 6) {
    const a = ip.toLowerCase();
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return isPublicAddress(mapped[1]);
    if (a === '::' || a === '::1') return false;
    if (/^f[cd]/.test(a)) return false; // unique local fc00::/7
    if (/^fe[89ab]/.test(a)) return false; // link-local fe80::/10
    if (/^ff/.test(a)) return false; // multicast
    return true;
  }
  return false;
}

/** → { ok: true, url: URL } | { ok: false, reason } — scheme, port and literal-IP checks (no DNS). */
export function checkUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }
  if (!['http:', 'https:'].includes(url.protocol))
    return { ok: false, reason: 'Only http and https links can be read.' };
  if (url.username || url.password) return { ok: false, reason: 'Links with embedded credentials are not allowed.' };
  if (url.port && !['80', '443'].includes(url.port))
    return { ok: false, reason: 'Only standard web ports are allowed.' };
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, reason: 'Local addresses are not allowed.' };
  }
  if (isIP(host) && !isPublicAddress(host)) return { ok: false, reason: 'Private network addresses are not allowed.' };
  return { ok: true, url };
}

async function resolvesPublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return isPublicAddress(host);
  const addrs = await lookup(host, { all: true });
  return addrs.length > 0 && addrs.every((a) => isPublicAddress(a.address));
}

async function readCapped(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const titleOf = (html) => htmlToText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 300));

/**
 * → { url, title, text } (text is plain, untrimmed of meaning, capped by the caller)
 * Throws with a human-readable message when the page can't or mustn't be read.
 */
export async function fetchPublicPage(raw) {
  let target = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkUrl(target);
    if (!check.ok) throw new Error(check.reason);
    const { url } = check;
    if (!(await resolvesPublic(url.hostname).catch(() => false))) {
      throw new Error('That address points to a private or unreachable network.');
    }
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' }
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      target = new URL(res.headers.get('location'), url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`The page answered ${res.status}.`);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      throw new Error(`That link is not a readable page (${type.split(';')[0] || 'unknown type'}).`);
    }
    const body = await readCapped(res);
    const html = /html/i.test(type);
    return { url: url.toString(), title: html ? titleOf(body) : '', text: html ? htmlToText(body) : body.trim() };
  }
  throw new Error('Too many redirects.');
}
