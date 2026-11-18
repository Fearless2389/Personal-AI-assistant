// Live browser-task events to the owner's open Nexus tabs over SSE (PLAN.md D7, chunk 2F).
// Same framing as hotkeyHub.js: `data: <json>\n\n`, a keep-alive comment every 25 s. Events only
// ever go to the user they belong to (steps can include text the agent typed).
const subscribers = new Set(); // { userId, res }
const HEARTBEAT_MS = 25_000;

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

/** One event → every open stream of this user. Returns how many got it. */
export function emit(userId, event) {
  const line = `data: ${JSON.stringify({ ...event, at: Date.now() })}\n\n`;
  let sent = 0;
  for (const sub of subscribers) {
    if (sub.userId !== userId) continue;
    sub.res.write(line);
    sent++;
  }
  return sent;
}

export const listenerCount = (userId) => [...subscribers].filter((s) => !userId || s.userId === userId).length;
