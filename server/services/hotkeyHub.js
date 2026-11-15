// Global push-to-talk: the tray helper (tools/hotkey/nexus-hotkey.ps1) reports
// Ctrl+Alt+Space down/up; this hub fans that out to the listening Nexus tab over a
// server-sent-event stream. Only this machine may press (loopback + shared secret),
// because a press opens the microphone. isLoopback / secretMatches are pure
// (hotkeyHub.test.js).
import { timingSafeEqual, createHash } from 'node:crypto';

const subscribers = new Set(); // { userId, res }
const HEARTBEAT_MS = 25_000;

export function isLoopback(address) {
  const a = String(address ?? '').replace(/^::ffff:/, '');
  return a === '127.0.0.1' || a === '::1' || /^127\./.test(a);
}

/** Constant-time compare (hash first so lengths always match). */
export function secretMatches(given, expected) {
  if (!expected || !given) return false;
  const h = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(h(given), h(expected));
}

export const hotkeyConfigured = () => Boolean(process.env.HOTKEY_SECRET);

/** Keep a response open as an SSE stream until the client disconnects. */
export function subscribe(userId, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });
  res.write(`data: ${JSON.stringify({ type: 'ready' })}\n\n`);
  const sub = { userId, res };
  subscribers.add(sub);
  const beat = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);
  res.on('close', () => {
    clearInterval(beat);
    subscribers.delete(sub);
  });
}

/** down | up → every listening tab. Returns how many tabs got it. */
export function broadcast(type) {
  const line = `data: ${JSON.stringify({ type, at: Date.now() })}\n\n`;
  for (const { res } of subscribers) res.write(line);
  return subscribers.size;
}

export const listenerCount = () => subscribers.size;
