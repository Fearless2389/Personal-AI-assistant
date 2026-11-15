// action_log reads and writes (migration 006). Pure data access — the rules about
// when a row may change state live in actionPolicy.js / actionGate.js.
import { supabaseAdmin } from './supabase.js';

const PUBLIC_COLS = 'id, source, tool, args, risk, status, summary, result, utterance, created_at, decided_at';
const MAX_TEXT = 1000;
const clip = (s) => (s == null ? null : String(s).slice(0, MAX_TEXT));
// Before migration 007 there is no `undo` column: keep logging, just without undo plans.
const missingUndoColumn = (err) => /undo/i.test(err?.message ?? '');

/** Insert one row; returns it. Throws on DB failure (callers decide if that's fatal). */
export async function insertAction(
  userId,
  { source, tool, args, risk, status, summary, result, utterance, sessionId, undo = null }
) {
  const row = {
    user_id: userId,
    source,
    tool,
    args: args ?? {},
    risk,
    status,
    summary: clip(summary),
    result: result ?? null,
    utterance: clip(utterance),
    session_id: sessionId ?? null,
    decided_at: status === 'awaiting_confirmation' ? null : new Date().toISOString()
  };
  const insert = (r) => supabaseAdmin.from('action_log').insert(r).select(PUBLIC_COLS).single();
  let { data, error } = await insert(undo ? { ...row, undo } : row);
  let undoSaved = Boolean(undo);
  if (error && undo && missingUndoColumn(error)) {
    ({ data, error } = await insert(row));
    undoSaved = false;
  }
  if (error) throw error;
  return { ...data, undo_saved: undoSaved };
}

/** Store the undo plan of an action that ran after a confirmation. */
export async function saveUndo(userId, id, undo) {
  const { error } = await supabaseAdmin.from('action_log').update({ undo }).eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

/** The newest action that ran (for "undo that"), with its undo plan. */
export async function latestExecuted(userId) {
  return withUndoColumn((cols) =>
    supabaseAdmin
      .from('action_log')
      .select(cols)
      .eq('user_id', userId)
      .eq('status', 'executed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  );
}

/** Read a row with its undo plan; before migration 007 the row comes back marked undo_unavailable. */
async function withUndoColumn(query) {
  let { data, error } = await query(`${PUBLIC_COLS}, undo`);
  if (error && missingUndoColumn(error)) {
    ({ data, error } = await query(PUBLIC_COLS));
    if (data) data = { ...data, undo: null, undo_unavailable: true };
  }
  if (error) throw error;
  return data;
}

/** executed → undone, once (compare-and-set like transition). Returns the row or null. */
export async function markUndone(userId, id) {
  const { data, error } = await supabaseAdmin
    .from('action_log')
    .update({ status: 'undone', undone_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'executed')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The undo itself failed: the action stands, so put the row back. */
export async function unmarkUndone(userId, id) {
  const { error } = await supabaseAdmin
    .from('action_log')
    .update({ status: 'executed', undone_at: null })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'undone');
  if (error) throw error;
}

/**
 * Atomically move a row from one status to another. Returns the row if this call
 * won the transition, null if the row was not in `from` (already decided, someone
 * else's, or gone) — this is what stops a double-tap from running an action twice.
 */
export async function transition(userId, id, from, to, patch = {}) {
  const { data, error } = await supabaseAdmin
    .from('action_log')
    .update({ status: to, decided_at: new Date().toISOString(), ...patch })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', from)
    .select(`${PUBLIC_COLS}, session_id`)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAction(userId, id, { withUndo = false } = {}) {
  const query = (cols) => supabaseAdmin.from('action_log').select(cols).eq('id', id).eq('user_id', userId).maybeSingle();
  if (withUndo) return withUndoColumn(query);
  const { data, error } = await query(PUBLIC_COLS);
  if (error) throw error;
  return data;
}

/** The newest action still waiting for a yes, if any. */
export async function latestPending(userId) {
  const { data, error } = await supabaseAdmin
    .from('action_log')
    .select(PUBLIC_COLS)
    .eq('user_id', userId)
    .eq('status', 'awaiting_confirmation')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRecentActions(userId, { limit = 20 } = {}) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const list = (cols) =>
    supabaseAdmin.from('action_log').select(cols).eq('user_id', userId).order('created_at', { ascending: false }).limit(n);
  let { data, error } = await list(`${PUBLIC_COLS}, undo`);
  if (error && missingUndoColumn(error)) ({ data, error } = await list(PUBLIC_COLS));
  if (error) throw error;
  // The plan stays on the server; the client only needs to know an Undo is possible.
  return (data ?? []).map(({ undo, ...r }) => ({
    ...r,
    undoable: r.status === 'executed' && Array.isArray(undo) && undo.length > 0
  }));
}

/** Kill switch: cancel every action still waiting for a yes. Returns the cancelled ids. */
export async function cancelAllPending(userId) {
  const { data, error } = await supabaseAdmin
    .from('action_log')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'awaiting_confirmation')
    .select('id');
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}
