// Undo for actions Nexus took on Rama's own data (tasks, notes, habits, goals,
// applications, SMS reminders). A handler that changes data returns an `undo` plan
// next to its result: a short list of steps that reverse it (delete what was created,
// put back the row as it was, re-insert what was deleted). The gate stores the plan
// in action_log.undo (migration 007) and never shows it to the model.
//
// Plans are data, so they are checked before they run (validateUndo, tested in
// undo.test.js): only these tables, only these step types, and every row is forced
// to belong to the user. Google Calendar, Gmail and opened websites have no plan.
import { supabaseAdmin } from './supabase.js';
import { embedAndStore } from './memory.js';
import { checkIn, undoCheckIn } from './habitService.js';
import { recomputeProgress } from './goalService.js';

export const UNDO_TABLES = new Set(['tasks', 'notes', 'habits', 'habit_logs', 'goals', 'goal_milestones', 'applications', 'sms_jobs']);
const STEP_KINDS = new Set(['delete', 'update', 'insert', 'habit_check', 'habit_uncheck', 'recompute_goal', 'reinstate_reminder']);
const NEVER_SET = new Set(['id', 'user_id']);
// Big or derived columns that are not worth storing in a plan (re-made after a restore).
const SKIP_COLS = new Set(['embedding']);

/** → null if the plan is well-formed, else a reason. Pure. */
export function validateUndo(steps) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 10) return 'An undo plan is 1-10 steps.';
  for (const s of steps) {
    if (!s || !STEP_KINDS.has(s.op)) return `Unknown undo step "${s?.op}".`;
    if (['delete', 'update', 'insert'].includes(s.op) && !UNDO_TABLES.has(s.table)) return `Table "${s.table}" can't be undone.`;
    if (['delete', 'update', 'reinstate_reminder'].includes(s.op) && !s.id) return `Step ${s.op} needs an id.`;
    if (s.op === 'update' && (!s.set || typeof s.set !== 'object' || Object.keys(s.set).some((k) => NEVER_SET.has(k))))
      return 'An update step may only set ordinary columns.';
    if (s.op === 'update' && s.match && Object.keys(s.match).some((k) => NEVER_SET.has(k)))
      return 'An update step may only match ordinary columns.';
    if (s.op === 'insert' && (!Array.isArray(s.rows) || s.rows.length === 0 || s.rows.length > 500))
      return 'An insert step needs 1-500 rows.';
    if (['habit_check', 'habit_uncheck'].includes(s.op) && (!s.habit_id || !/^\d{4}-\d{2}-\d{2}$/.test(s.date ?? '')))
      return `Step ${s.op} needs habit_id and a YYYY-MM-DD date.`;
    if (s.op === 'recompute_goal' && !s.goal_id) return 'recompute_goal needs goal_id.';
  }
  return null;
}

// ---- building plans (used by the handlers) ----------------------------------------

const strip = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !SKIP_COLS.has(k)));

/** Undo a create: delete the new row. */
export const deleteStep = (table, id) => ({ op: 'delete', table, id });

/** Undo an edit: put back the earlier values of the columns that were changed. */
export function restoreStep(table, before, keys) {
  const set = {};
  for (const k of keys) if (k in before && !NEVER_SET.has(k) && !SKIP_COLS.has(k)) set[k] = before[k];
  return { op: 'update', table, id: before.id, set };
}

/** Undo a delete: insert the rows back with their original ids. */
export const insertStep = (table, rows) => ({ op: 'insert', table, rows: rows.map(strip) });

/** Whole row (and, for habits/goals, their logs/milestones) before it is deleted. */
export async function snapshotForDelete(table, id, userId) {
  const get = async (t, col, val) => {
    const { data, error } = await supabaseAdmin.from(t).select('*').eq(col, val).eq('user_id', userId);
    if (error) throw error;
    return data ?? [];
  };
  const [row] = await get(table, 'id', id);
  if (!row) return null;
  const steps = [insertStep(table, [row])];
  if (table === 'habits') {
    const logs = await get('habit_logs', 'habit_id', id);
    if (logs.length) steps.push(insertStep('habit_logs', logs));
  }
  if (table === 'goals') {
    const ms = await get('goal_milestones', 'goal_id', id);
    if (ms.length) steps.push(insertStep('goal_milestones', ms));
  }
  return steps;
}

/** A row as it is now (for restoring an edit). */
export async function snapshotRow(table, id, userId) {
  const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

// ---- running plans -----------------------------------------------------------------

function must({ error }) {
  if (error) throw error;
}

/** Run a validated plan for this user. Throws on the first failing step. */
export async function applyUndo(userId, steps) {
  const bad = validateUndo(steps);
  if (bad) throw new Error(bad);
  for (const s of steps) {
    if (s.op === 'delete') {
      must(await supabaseAdmin.from(s.table).delete().eq('id', s.id).eq('user_id', userId));
    } else if (s.op === 'update') {
      // `match` guards the step: it applies only if the row is still in that state.
      let q = supabaseAdmin.from(s.table).update(s.set).eq('id', s.id).eq('user_id', userId);
      for (const [k, v] of Object.entries(s.match ?? {})) q = q.eq(k, v);
      const { data, error } = await q.select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('It has changed since, so it can\'t be undone.');
      if (s.table === 'notes' && typeof s.set.content === 'string') {
        setImmediate(() => embedAndStore(userId, 'notes', s.id, s.set.content));
      }
    } else if (s.op === 'insert') {
      const rows = s.rows.map((r) => ({ ...r, user_id: userId }));
      must(await supabaseAdmin.from(s.table).insert(rows));
      if (s.table === 'notes') for (const r of rows) setImmediate(() => embedAndStore(userId, 'notes', r.id, r.content));
    } else if (s.op === 'habit_check') {
      await checkIn(userId, s.habit_id, { date: s.date });
    } else if (s.op === 'habit_uncheck') {
      await undoCheckIn(userId, s.habit_id, { date: s.date });
    } else if (s.op === 'recompute_goal') {
      await recomputeProgress(userId, s.goal_id);
    } else if (s.op === 'reinstate_reminder') {
      const { data, error } = await supabaseAdmin
        .from('sms_jobs')
        .update({ status: 'pending' })
        .eq('id', s.id)
        .eq('user_id', userId)
        .eq('status', 'cancelled')
        .gt('scheduled_at', new Date().toISOString())
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("That reminder's time has already passed, so it can't be brought back.");
    }
  }
}
