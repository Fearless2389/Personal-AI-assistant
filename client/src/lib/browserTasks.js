// What the UI does with browser-agent tasks: applies server events and catch-up reads to
// useBrowserStore, and the buttons' actions (answer, stop, dismiss, load steps). The server decides
// everything; this only mirrors it. Risky steps still go through lib/confirmations.js (ConfirmCard).
import { useBrowserStore, FINAL } from '../store/useBrowserStore.js';
import { browserApi, actionsApi } from './api.js';
import { trackBrowserStep, closeBrowserCards } from './confirmations.js';
import { tellBrowserNews } from './voice/engine.js';
import { browserCue } from './voice/browserCues.js';

const set = useBrowserStore.setState;
const get = useBrowserStore.getState;

const NOTICE_WINDOW_MS = 10 * 60_000; // a task that ended while we were away still gets its notice
const SEEN_KEY = 'nexus.browser.noticed'; // per-browser convenience; works without storage too
const SEEN_MAX = 20;

function readSeen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function markSeen(id) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([id, ...readSeen().filter((x) => x !== id)].slice(0, SEEN_MAX)));
  } catch {
    /* storage blocked: the notice may show again after a reload, nothing worse */
  }
}

function patchTask(id, fields) {
  if (!id) return;
  set((s) => ({ tasks: { ...s.tasks, [id]: { ...s.tasks[id], id, ...fields, seenAt: Date.now() } } }));
}

function showNotice(id) {
  if (readSeen().includes(id)) return;
  markSeen(id);
  set({ notice: id });
}

/** One event from GET /api/browser/events (live only: a catch-up read is never spoken). */
export function applyBrowserEvent(e) {
  applyToStore(e);
  tellBrowserNews(browserCue(e, get().tasks[e.taskId])); // voice, if a session is open
}

function applyToStore(e) {
  switch (e.type) {
    case 'task':
      patchTask(e.task.id, e.task);
      break;
    case 'question':
      patchTask(e.taskId, { status: 'waiting_user', question: e.question });
      break;
    case 'needs_confirmation':
      if (!e.confirmation_id) break;
      trackBrowserStep({ id: e.confirmation_id, summary: e.summary, taskId: e.taskId, shot: e.step?.shot_path });
      patchTask(e.taskId, { status: 'waiting_confirmation' });
      break;
    case 'step': {
      const t = get().tasks[e.taskId];
      set((s) => ({ steps: { ...s.steps, [e.taskId]: [...(s.steps[e.taskId] ?? []).filter((x) => x.n !== e.step.n), e.step] } }));
      // A recorded step means the loop moved on (a confirm was answered).
      patchTask(e.taskId, {
        status: t?.status === 'waiting_confirmation' ? 'running' : (t?.status ?? 'running'),
        steps_used: Math.max(t?.steps_used ?? 0, e.step.n)
      });
      break;
    }
    case 'finished':
      patchTask(e.taskId, { status: e.status, summary: e.summary, question: null });
      closeBrowserCards(e.taskId);
      showNotice(e.taskId);
      break;
    default:
  }
}

/**
 * The stream (re)connected at `since`: read the recent tasks so a page opened mid-task, or a
 * reconnect after a server restart, shows the truth. Events newer than `since` win.
 */
export async function catchUp(since) {
  const { tasks } = await browserApi.list(8);
  for (const t of tasks) {
    const known = get().tasks[t.id];
    if (known && known.seenAt >= since) continue; // an event in the same millisecond as `ready` is still newer
    set((s) => ({ tasks: { ...s.tasks, [t.id]: { ...t, seenAt: since } } }));
    if (FINAL.has(t.status)) closeBrowserCards(t.id);
  }
  const waiting = tasks.find((t) => t.status === 'waiting_confirmation');
  if (waiting) await findParkedStep(waiting.id);
  const ended = tasks.find((t) => FINAL.has(t.status));
  if (ended?.finished_at && Date.now() - Date.parse(ended.finished_at) < NOTICE_WINDOW_MS) showNotice(ended.id);
}

// A step parked before this page connected: its action_log row is the ConfirmCard.
async function findParkedStep(taskId) {
  const { actions } = await actionsApi.list(20);
  const row = actions.find(
    (a) => a.tool === 'browser_step' && a.status === 'awaiting_confirmation' && a.args?.task_id === taskId
  );
  if (!row) return;
  trackBrowserStep({ id: row.id, summary: row.summary, taskId, shot: row.args?.shot });
}

/**
 * Steps the stream didn't show live: an older task, or the start of one this page joined midway
 * (it has fewer steps than steps_used). Fetched at most once per step count, merged with live ones.
 */
const fetchedAt = new Map(); // task id → steps_used when last fetched
export async function loadSteps(taskId) {
  const t = get().tasks[taskId];
  const have = get().steps[taskId]?.length ?? 0;
  if (!t || have >= t.steps_used || fetchedAt.get(taskId) >= t.steps_used) return;
  fetchedAt.set(taskId, t.steps_used);
  try {
    const { task } = await browserApi.get(taskId);
    set((s) => {
      const byN = new Map((task.steps ?? []).map((x) => [x.n, x]));
      for (const x of s.steps[taskId] ?? []) byN.set(x.n, x);
      return { steps: { ...s.steps, [taskId]: [...byN.values()].sort((a, b) => a.n - b.n) } };
    });
  } catch (err) {
    fetchedAt.delete(taskId);
    console.warn('[browser] could not load steps:', err.message);
  }
}

/** Reply to the task's question; it continues. Throws with the server's message on failure. */
export async function answerTask(taskId, text) {
  const { task } = await browserApi.answer(taskId, text);
  patchTask(taskId, { ...task, question: null });
}

export async function stopTask(taskId) {
  const { task } = await browserApi.stop(taskId);
  if (task) patchTask(taskId, task);
}

export const dismissNotice = () => set({ notice: null });

/** Quick replies for the questions the agent itself asks (agentLoop.js); free text always works too. */
export function quickReplies(question) {
  if (/continue as guest/i.test(question ?? '')) return ["I've signed in", 'Continue as guest'];
  return [];
}
