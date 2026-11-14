// action_log reads and writes (migration 006). Pure data access — the rules about
// when a row may change state live in actionPolicy.js / actionGate.js.
import { supabaseAdmin } from './supabase.js';

const PUBLIC_COLS = 'id, source, tool, args, risk, status, summary, result, utterance, created_at, decided_at';
const MAX_TEXT = 1000;
const clip = (s) => (s == null ? null : String(s).slice(0, MAX_TEXT));

/** Insert one row; returns it. Throws on DB failure (callers decide if that's fatal). */
export async function insertAction(
  userId,
  { source, tool, args, risk, status, summary, result, utterance, sessionId }
) {
  const { data, error } = await supabaseAdmin
    .from('action_log')
    .insert({
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
    })
    .select(PUBLIC_COLS)
    .single();
  if (error) throw error;
  return data;
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

export async function getAction(userId, id) {
  const { data, error } = await supabaseAdmin
    .from('action_log')
    .select(PUBLIC_COLS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
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
  const { data, error } = await supabaseAdmin
    .from('action_log')
    .select(PUBLIC_COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 20, 1), 100));
  if (error) throw error;
  return data ?? [];
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
