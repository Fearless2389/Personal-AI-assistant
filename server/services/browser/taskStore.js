// browser_tasks / browser_steps reads and writes (migration 008, PLAN.md chunk 2C). Pure data
// access, every query scoped by user_id. Who may change a task's status, and when, is runner.js's job;
// setStatus is compare-and-set (like actionLog.transition) so two callers can't both move a task.
import { supabaseAdmin } from '../supabase.js';

export const OPEN_STATUSES = ['queued', 'running', 'waiting_confirmation', 'waiting_user'];
export const ACTIVE_STATUSES = ['running', 'waiting_confirmation', 'waiting_user'];
export const FINAL_STATUSES = ['done', 'failed', 'stopped'];

const TASK_COLS =
  'id, goal, kind, start_url, source, status, success, summary, question, collected, steps_used, created_at, started_at, finished_at';
const STEP_COLS = 'id, n, action, args, label, target, url, risk, status, note, action_log_id, shot_path, created_at';
const MAX_TEXT = 2000;
const clip = (s) => (s == null ? null : String(s).slice(0, MAX_TEXT));

/** Before migration 008 runs, every call fails with this: say what to do instead of a raw DB error. */
export function missingTables(err) {
  return /browser_(tasks|steps)/.test(err?.message ?? '') && /does not exist|schema cache|relation/i.test(err?.message ?? '');
}
function check(error) {
  if (!error) return;
  if (missingTables(error)) {
    const e = new Error('The browser agent needs migration 008 (supabase/migrations/008_browser_tasks.sql).');
    e.code = 'migration_008_missing';
    throw e;
  }
  throw error;
}

export async function createTask(userId, { goal, kind = 'errand', startUrl = null, source }) {
  const { data, error } = await supabaseAdmin
    .from('browser_tasks')
    .insert({ user_id: userId, goal: clip(goal), kind, start_url: startUrl, source, status: 'queued' })
    .select(TASK_COLS)
    .single();
  check(error);
  return data;
}

/**
 * Compare-and-set status change: only moves the task if it is currently in `from` (a status or a
 * list). Returns the updated task, or null if someone else moved it first.
 */
export async function setStatus(userId, id, from, to, patch = {}) {
  const now = new Date().toISOString();
  const update = { status: to, ...patch };
  if (to === 'running' && !patch.started_at) update.started_at = now;
  if (FINAL_STATUSES.includes(to)) update.finished_at = now;
  for (const k of ['summary', 'question']) if (k in update) update[k] = clip(update[k]);
  let query = supabaseAdmin.from('browser_tasks').update(update).eq('id', id).eq('user_id', userId);
  query = Array.isArray(from) ? query.in('status', from) : query.eq('status', from);
  const { data, error } = await query.select(TASK_COLS).maybeSingle();
  check(error);
  return data;
}

/** Non-status fields (steps_used, collected) on a task that is still open. */
export async function patchTask(userId, id, patch) {
  const { error } = await supabaseAdmin
    .from('browser_tasks')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .in('status', OPEN_STATUSES);
  check(error);
}

export async function addStep(userId, taskId, step) {
  const { data, error } = await supabaseAdmin
    .from('browser_steps')
    .insert({
      task_id: taskId,
      user_id: userId,
      n: step.n,
      action: step.action,
      args: step.args ?? {},
      label: clip(step.label),
      target: clip(step.target),
      url: clip(step.url),
      risk: step.risk,
      status: step.status,
      note: clip(step.note),
      action_log_id: step.action_log_id ?? null,
      shot_path: step.shot_path ?? null
    })
    .select(STEP_COLS)
    .single();
  check(error);
  return data;
}

export async function updateStep(userId, taskId, n, patch) {
  const { data, error } = await supabaseAdmin
    .from('browser_steps')
    .update(patch)
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .eq('n', n)
    .select(STEP_COLS)
    .maybeSingle();
  check(error);
  return data;
}

export async function getTask(userId, id, { withSteps = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('browser_tasks')
    .select(TASK_COLS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  check(error);
  if (!data || !withSteps) return data;
  const steps = await supabaseAdmin
    .from('browser_steps')
    .select(STEP_COLS)
    .eq('task_id', id)
    .eq('user_id', userId)
    .order('n');
  check(steps.error);
  return { ...data, steps: steps.data };
}

export async function listTasks(userId, limit = 20) {
  const { data, error } = await supabaseAdmin
    .from('browser_tasks')
    .select(TASK_COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 100));
  check(error);
  return data;
}

/** The task holding the slot (running or waiting on Ruthvik), if any (D5). */
export async function activeTask(userId) {
  const { data, error } = await supabaseAdmin
    .from('browser_tasks')
    .select(TASK_COLS)
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  check(error);
  return data;
}

/** Queued tasks, oldest first (D5). */
export async function queuedTasks(userId) {
  const { data, error } = await supabaseAdmin
    .from('browser_tasks')
    .select(TASK_COLS)
    .eq('user_id', userId)
    .eq('status', 'queued')
    .order('created_at');
  check(error);
  return data;
}

export async function nextQueued(userId) {
  return (await queuedTasks(userId))[0] ?? null;
}

/**
 * On server start: tasks a crash left open can't continue (their page and model state are gone).
 * Marks them stopped for every user; returns how many.
 */
export async function stopOrphans(reason = 'Server restarted') {
  const { data, error } = await supabaseAdmin
    .from('browser_tasks')
    .update({ status: 'stopped', summary: reason, finished_at: new Date().toISOString() })
    .in('status', OPEN_STATUSES)
    .select('id');
  check(error);
  return data.length;
}
