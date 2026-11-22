// Runs browser tasks for each user, one at a time, the rest queued (PLAN.md D5, chunk 2D).
//
//   startTask → row 'queued' → pump: when the slot is free, the oldest queued task moves to
//   'running' and the loop (agentLoop.runTask) drives a tab in the agent window. A task asking
//   Ruthvik a question ('waiting_user') or waiting for a yes ('waiting_confirmation') keeps the
//   slot; no answer for 15 minutes → 'stopped', and the queue moves on.
//
// The loop itself has no database; this file persists its steps and status changes (taskStore)
// and fans events out (hub.emit → SSE in chunk 2F). Dependencies are injected so runner.test.js
// can drive it with an in-memory store and a fake loop.
import * as taskStore from './taskStore.js';
import { runTask } from './agentLoop.js';
import { newPage } from './driver.js';
import { makeDecide, reportStep } from './confirm.js';
import { takeShot, sweepShots } from './shots.js';

export const MAX_QUEUE = 5;
export const ANSWER_TIMEOUT_MS = 15 * 60_000;
const ACTIVE = taskStore.ACTIVE_STATUSES;

export function createRunner({
  store = taskStore,
  run = runTask,
  openPage = newPage,
  hub = { emit() {} },
  // Confirm steps: parked in action_log and decided through the gate (confirm.js).
  decideFor = (userId, task, slot) => makeDecide({ userId, task, signal: slot.abort.signal, store, hub }),
  allowOrigins = [], // the local fixture site, for live checks only
  shoot = takeShot, // screenshots before a risky step and at the end (shots.js)
  sweep = sweepShots,
  answerTimeoutMs = ANSWER_TIMEOUT_MS,
  maxQueue = MAX_QUEUE,
  log = console
} = {}) {
  const users = new Map(); // userId → { active: Slot | null, lock: Promise }

  const user = (userId) => {
    if (!users.has(userId)) users.set(userId, { active: null, lock: Promise.resolve() });
    return users.get(userId);
  };
  const emit = (userId, event) => {
    try {
      hub.emit(userId, event);
    } catch (err) {
      log.warn('[browser] event fan-out failed:', err.message);
    }
  };
  // Serialise queue decisions per user (two startTask calls must not both take the slot).
  const locked = (userId, fn) => {
    const u = user(userId);
    const next = u.lock.then(fn, fn);
    u.lock = next.catch(() => {});
    return next;
  };

  async function closeSlot(userId, slot) {
    clearTimeout(slot.timer);
    await slot.page?.close().catch(() => {});
    if (user(userId).active === slot) user(userId).active = null;
  }

  async function finalize(userId, slot, status, patch) {
    const shot = slot.page ? await shoot(slot.page, slot.id, 'final') : null; // what it left behind
    const task = await store.setStatus(userId, slot.id, ACTIVE, status, patch).catch((err) => {
      log.error('[browser] could not save the final status:', err.message);
      return null;
    });
    await closeSlot(userId, slot);
    emit(userId, { type: 'finished', taskId: slot.id, status, summary: patch.summary ?? null, shot });
    if (task) emit(userId, { type: 'task', task });
    pump(userId);
  }

  // One run of the loop (a fresh start, or a resume after an answer).
  async function drive(userId, slot, task, { resume = null, answer = null } = {}) {
    let result;
    try {
      slot.page ??= await openPage();
      result = await run({
        goal: task.goal,
        kind: task.kind,
        page: slot.page,
        startUrl: resume ? null : task.start_url,
        signal: slot.abort.signal,
        allowOrigins,
        decide: withShot(slot, decideFor(userId, task, slot)),
        resume,
        answer,
        onEvent: (event) => onLoopEvent(userId, slot, event)
      });
    } catch (err) {
      log.error('[browser] task crashed:', err);
      return finalize(userId, slot, 'failed', { summary: `Something went wrong: ${err.message}`, success: false });
    }
    slot.page = result.page;

    if (result.status === 'waiting_user' && !slot.abort.signal.aborted) {
      slot.state = result.state;
      const task2 = await store.setStatus(userId, slot.id, 'running', 'waiting_user', { question: result.question });
      emit(userId, { type: 'question', taskId: slot.id, question: result.question });
      if (task2) emit(userId, { type: 'task', task: task2 });
      slot.timer = setTimeout(() => {
        stopTask(userId, slot.id, `No answer for ${Math.round(answerTimeoutMs / 60_000)} minutes, so I stopped.`).catch(() => {});
      }, answerTimeoutMs);
      slot.timer.unref?.();
      return;
    }
    const status = slot.abort.signal.aborted ? 'stopped' : result.status;
    return finalize(userId, slot, status, {
      summary: status === 'stopped' ? (slot.stopReason ?? 'Stopped.') : result.summary,
      success: status === 'done' ? result.success : false,
      collected: result.collected?.length ? result.collected : null,
      steps_used: result.steps.length,
      question: null
    });
  }

  // A risky step: screenshot the page first, so the card shows what Ruthvik is approving.
  const withShot = (slot, decide) => async (step, classification) => {
    const shot = await shoot(slot.page, slot.id, step.n);
    if (!shot) return decide(step, classification);
    slot.shots.set(step.n, shot);
    return decide({ ...step, shot_path: shot }, classification);
  };

  function onLoopEvent(userId, slot, event) {
    if (event.type !== 'step') return;
    const shot = slot.shots.get(event.step.n);
    const step = shot ? { ...event.step, shot_path: shot } : event.step;
    reportStep(userId, slot.id, step); // a step that waited on the gate: tell it what happened
    slot.steps += 1;
    store
      .addStep(userId, slot.id, step)
      .then(() => store.patchTask(userId, slot.id, { steps_used: slot.steps }))
      .catch((err) => log.warn('[browser] could not save a step:', err.message));
    emit(userId, { type: 'step', taskId: slot.id, step });
  }

  // Start the oldest queued task if the slot is free.
  function pump(userId) {
    return locked(userId, async () => {
      const u = user(userId);
      if (u.active) return;
      for (;;) {
        const next = await store.nextQueued(userId);
        if (!next) return;
        const task = await store.setStatus(userId, next.id, 'queued', 'running');
        if (!task) continue; // stopped meanwhile: try the next one
        const slot = { id: task.id, abort: new AbortController(), page: null, state: null, timer: null, steps: 0, shots: new Map() };
        u.active = slot;
        emit(userId, { type: 'task', task });
        drive(userId, slot, task);
        return;
      }
    });
  }

  async function startTask(userId, { goal, kind = 'errand', startUrl = null, source }) {
    const { task, position } = await locked(userId, async () => {
      const queued = await store.queuedTasks(userId);
      if (queued.length >= maxQueue) {
        const err = new Error(
          `${queued.length} tasks are already waiting: ${queued.map((t) => `"${t.goal.slice(0, 40)}"`).join(', ')}. Stop one first.`
        );
        err.code = 'queue_full';
        throw err;
      }
      const created = await store.createTask(userId, { goal, kind, startUrl, source });
      return { task: created, position: (user(userId).active ? 1 : 0) + queued.length };
    });
    emit(userId, { type: 'task', task });
    await pump(userId);
    return { task: (await store.getTask(userId, task.id)) ?? task, position };
  }

  async function stopTask(userId, id, reason = 'Stopped.') {
    const slot = user(userId).active;
    if (slot?.id === id) {
      slot.stopReason = reason;
      slot.abort.abort();
      // Waiting for an answer: no loop is running to notice the abort, so finish it here.
      if (slot.state) {
        slot.state = null;
        await finalize(userId, slot, 'stopped', { summary: reason, success: false, question: null });
      }
      return store.getTask(userId, id);
    }
    const task = await store.setStatus(userId, id, 'queued', 'stopped', { summary: reason, success: false });
    if (task) emit(userId, { type: 'task', task });
    return task ?? store.getTask(userId, id);
  }

  async function stopAll(userId, reason = 'Stopped.') {
    // Queue first, so finishing the active task doesn't start the next one.
    const queued = await store.queuedTasks(userId);
    for (const t of queued) await stopTask(userId, t.id, reason);
    const slot = user(userId).active;
    if (slot) await stopTask(userId, slot.id, reason);
    return { stopped: queued.length + (slot ? 1 : 0) };
  }

  async function answerTask(userId, id, text) {
    const slot = user(userId).active;
    if (!slot || slot.id !== id || !slot.state) {
      const err = new Error("That task isn't waiting for an answer.");
      err.code = 'not_waiting';
      throw err;
    }
    clearTimeout(slot.timer);
    const task = await store.setStatus(userId, id, 'waiting_user', 'running', { question: null });
    if (!task) throw Object.assign(new Error("That task isn't waiting for an answer."), { code: 'not_waiting' });
    const resume = slot.state;
    slot.state = null;
    emit(userId, { type: 'task', task });
    drive(userId, slot, task, { resume, answer: String(text ?? '') });
    return task;
  }

  async function status(userId) {
    const [active, queue] = await Promise.all([store.activeTask(userId), store.queuedTasks(userId)]);
    return { active, queue };
  }

  // Server start: open tasks from before a restart can't continue (page + model state are gone).
  async function recover() {
    const n = await store.stopOrphans('Server restarted');
    if (n) log.warn(`[browser] stopped ${n} task(s) left open by a restart`);
    const swept = await sweep().catch(() => 0);
    if (swept) log.info?.(`[browser] removed screenshots of ${swept} task(s) older than 7 days`);
    return n;
  }

  return { startTask, stopTask, stopAll, answerTask, status, recover, _activeSlot: (userId) => user(userId).active };
}
