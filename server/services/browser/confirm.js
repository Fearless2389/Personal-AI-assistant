// Risky browser steps go through the same confirmation gate as everything else (PLAN.md D6,
// chunk 2E). When the loop proposes a confirm step, makeDecide parks it as an action_log row
// (tool 'browser_step', awaiting_confirmation), so it shows up as a ConfirmCard in chat/voice/⌘K and
// can be approved by a tap or a spoken yes, exactly like sending an email.
//
//   yes → actionGate.resolvePending → handleToolCall('browser_step') → executeParkedStep here:
//         it releases the waiting loop, which runs the step on the live page and reports back,
//         so the gate records the real outcome.
//   no / Esc / expiry / task stopped → the row isn't 'awaiting_confirmation' any more → declined.
//
// Only a step the loop itself parked, and is still waiting on, can run: a browser_step row
// created any other way finds nothing waiting and does nothing.
import * as actionLog from '../actionLog.js';
import { CONFIRM_TTL_MS } from '../actionPolicy.js';

const POLL_MS = 1000;
const REPORT_TIMEOUT_MS = 30_000;
const waiting = new Map(); // `${userId}:${taskId}:${n}` → entry

const keyOf = (userId, taskId, n) => `${userId}:${taskId}:${n}`;
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return 'the page';
  }
};

/** The readback on the ConfirmCard and in voice: where, and exactly what. */
export function describeStep(step, reason) {
  return `On ${hostOf(step.url)}: ${reason || step.label}`;
}

/**
 * The loop's `decide` for one task. Parks the step, waits for Ruthvik, returns 'execute' | 'decline'.
 * Deps are injectable for tests.
 */
export function makeDecide({
  userId,
  task,
  signal,
  store,
  hub = { emit() {} },
  log = actionLog,
  ttlMs = CONFIRM_TTL_MS,
  pollMs = POLL_MS
}) {
  return async (step, classification) => {
    const summary = describeStep(step, classification.reason);
    let row;
    try {
      row = await log.insertAction(userId, {
        source: task.source,
        tool: 'browser_step',
        args: {
          task_id: task.id,
          n: step.n,
          action: step.action,
          target: step.target,
          url: step.url,
          label: step.label,
          shot: step.shot_path ?? null // screenshot of the page it's about to act on (shots.js)
        },
        risk: 'confirm',
        status: 'awaiting_confirmation',
        summary
      });
    } catch (err) {
      console.error('[browser] could not park a step for confirmation:', err.message);
      return 'decline';
    }

    const key = keyOf(userId, task.id, step.n);
    let approve;
    const approved = new Promise((r) => (approve = r));
    let report;
    const reported = new Promise((r) => (report = r));
    waiting.set(key, { actionId: row.id, approve, report, reported });

    await store.setStatus(userId, task.id, 'running', 'waiting_confirmation').catch(() => null);
    hub.emit(userId, { type: 'needs_confirmation', taskId: task.id, confirmation_id: row.id, summary, step });

    // Wait for: the gate's yes (approve), or the row leaving awaiting_confirmation (no, Esc,
    // expiry), or the task being stopped, or the confirmation window running out.
    const deadline = Date.now() + ttlMs + 5000;
    let decision = null;
    approved.then(() => (decision ??= 'execute'));
    while (!decision) {
      if (signal?.aborted) decision = 'stopped';
      else if (Date.now() > deadline) decision = 'expired';
      else {
        await Promise.race([approved, new Promise((r) => setTimeout(r, pollMs))]);
        if (decision) break;
        const current = await log.getAction(userId, row.id).catch(() => null);
        if (current && current.status !== 'awaiting_confirmation' && current.status !== 'confirmed') decision = 'declined';
      }
    }
    if (decision !== 'execute') {
      waiting.delete(key);
      // Make sure the card can't be approved afterwards.
      await log.transition(userId, row.id, 'awaiting_confirmation', decision === 'expired' ? 'expired' : 'cancelled').catch(() => null);
    }
    await store.setStatus(userId, task.id, 'waiting_confirmation', 'running').catch(() => null);
    return decision === 'execute' ? 'execute' : 'decline';
  };
}

/** The runner calls this for every recorded step; a step that was waiting on the gate reports its outcome. */
export function reportStep(userId, taskId, step) {
  const entry = waiting.get(keyOf(userId, taskId, step.n));
  if (!entry) return;
  waiting.delete(keyOf(userId, taskId, step.n));
  entry.report(step);
}

/**
 * handleToolCall('browser_step') — reached only through actionGate.resolvePending after a yes.
 * Releases the waiting loop and returns what actually happened on the page.
 */
export async function executeParkedStep(userId, args = {}) {
  const entry = waiting.get(keyOf(userId, args.task_id, args.n));
  if (!entry) {
    return { ok: false, error: 'That browser step is no longer waiting (the task moved on or was stopped).' };
  }
  entry.approve();
  const step = await Promise.race([
    entry.reported,
    new Promise((r) => setTimeout(() => r(null), REPORT_TIMEOUT_MS))
  ]);
  if (!step) return { ok: false, error: 'The browser step did not finish in time.' };
  if (step.status === 'done') return { ok: true, message: `Done: ${step.label}.`, url: step.url };
  return { ok: false, error: `The step didn't work: ${step.note ?? step.status}` };
}

export const BROWSE_HANDLERS = Object.freeze({ browser_step: executeParkedStep });

// for tests
export const _waiting = waiting;
