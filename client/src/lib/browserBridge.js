// Browser-agent events → the UI (PLAN.md chunk 2G). Listens to GET /api/browser/events while
// signed in. A risky step the agent parked arrives as `needs_confirmation`; it becomes a normal
// ConfirmCard (lib/confirmations.js), so a tap or a spoken yes approves it through the gate like
// any other action. When a task ends, its leftover cards close. 404 = the agent is not enabled on
// the server: stop quietly. (Week 3 adds the task card, step feed and Agent page on top.)
import { streamBrowserEvents } from './api.js';
import { trackBrowserStep, closeBrowserCards } from './confirmations.js';

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;
const FINAL = new Set(['done', 'failed', 'stopped']);

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

export function handleBrowserEvent(e) {
  if (e.type === 'needs_confirmation' && e.confirmation_id) {
    trackBrowserStep({ id: e.confirmation_id, summary: e.summary, taskId: e.taskId });
  } else if (e.type === 'finished' || (e.type === 'task' && FINAL.has(e.task?.status))) {
    closeBrowserCards(e.taskId ?? e.task?.id);
  }
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
