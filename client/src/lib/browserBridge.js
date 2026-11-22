// Browser-agent events → the UI. Listens to GET /api/browser/events while signed in and hands each
// event to lib/browserTasks.js (task store + ConfirmCards). On every (re)connect, the server's
// `ready` event triggers a catch-up read, so a reload or a server restart never leaves a stale strip.
// 404 = the agent is not enabled on the server: stop quietly.
import { streamBrowserEvents } from './api.js';
import { applyBrowserEvent, catchUp } from './browserTasks.js';

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

export function handleBrowserEvent(e) {
  if (e.type === 'ready') {
    catchUp(Date.now()).catch((err) => console.warn('[browser] catch-up failed:', err.message));
    return;
  }
  applyBrowserEvent(e);
}

async function listen(signal) {
  let wait = RETRY_MIN_MS;
  while (!signal.aborted) {
    try {
      await streamBrowserEvents({
        signal,
        onEvent: (e) => {
          wait = RETRY_MIN_MS;
          handleBrowserEvent(e);
        }
      });
    } catch (err) {
      if (signal.aborted) return;
      if (err.status === 404 || err.status === 401) return; // agent off / signed out
    }
    await sleep(wait, signal);
    wait = Math.min(wait * 2, RETRY_MAX_MS);
  }
}

/** Start listening. Returns a stop function. */
export function startBrowserBridge() {
  const ctrl = new AbortController();
  listen(ctrl.signal);
  return () => ctrl.abort();
}
