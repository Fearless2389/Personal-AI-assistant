// The confirmation gate: the one place every assistant tool call passes through
// (voice and chat). Safe tools run and are logged; risky tools are parked in
// action_log as 'awaiting_confirmation' and run only after an explicit yes — a tap
// on Confirm, or your own spoken words. The model can ask, but it can never
// approve its own action: a spoken yes is checked against your microphone's
// transcript, which it does not write.
import { handleToolCall, normalizeDates } from './tools.js';
import { riskOf, isReadOnly, isAffirmative, isNegative, isFresh, describeAction } from './actionPolicy.js';
import * as actionLog from './actionLog.js';
import { DEFAULT_TZ, formatInTz } from './time.js';

const whenIn = (tz) => (iso) => formatInTz(tz, new Date(iso));

/** Log without letting a logging failure break the action itself. */
async function record(userId, row) {
  try {
    return await actionLog.insertAction(userId, row);
  } catch (err) {
    console.error('[actions] log write failed:', err.message);
    return null;
  }
}

/**
 * Run a tool call through the gate.
 * opts: { tz, source: 'voice'|'chat', utterance, sessionId, gate = true }
 * gate=false still logs but never parks — used by typed chat, where the request is
 * already on screen in your own words (gating chat is a later roadmap item).
 */
export async function runGuarded(
  userId,
  name,
  rawArgs,
  { tz = DEFAULT_TZ, source, utterance, sessionId, gate = true } = {}
) {
  const args = normalizeDates(rawArgs, tz);
  const risk = riskOf(name);
  const base = { source, tool: name, args, risk, utterance, sessionId };

  if (risk === 'never') {
    await record(userId, { ...base, status: 'blocked', summary: describeAction(name, args, whenIn(tz)) });
    return { ok: false, error: 'Nexus is not allowed to do that.' };
  }

  if (risk === 'confirm' && gate) {
    const summary = describeAction(name, args, whenIn(tz));
    let row;
    try {
      row = await actionLog.insertAction(userId, { ...base, status: 'awaiting_confirmation', summary });
    } catch (err) {
      console.error('[actions] could not park action:', err.message);
      return { ok: false, error: 'Could not prepare that action. Nothing was done.' };
    }
    return {
      ok: true,
      needs_confirmation: true,
      confirmation_id: row.id,
      summary,
      message:
        'NOT DONE YET. Read the summary back in one short sentence and ask the user to confirm. ' +
        'They can tap Confirm or say yes. When they answer out loud, call resolve_pending_action. ' +
        'Never say it is done until resolve_pending_action reports it executed.'
    };
  }

  const result = await handleToolCall(name, args, userId, { tz });
  if (!isReadOnly(name)) {
    await record(userId, {
      ...base,
      status: result?.ok === false ? 'failed' : 'executed',
      summary: result?.message ?? null,
      result
    });
  }
  return result;
}

/**
 * Approve or cancel a parked action.
 * via 'button': the decision is the tap itself.
 * via 'voice':  the decision comes from `utterance` (your transcribed words); the
 *               model's `decision` is only a hint and can never turn a non-yes into a yes.
 * id may be omitted for voice: the newest pending action is used.
 */
export async function resolvePending(userId, { id, decision, via, utterance, tz = DEFAULT_TZ }) {
  const row = id ? await actionLog.getAction(userId, id) : await actionLog.latestPending(userId);
  if (!row) return { ok: false, status: 'not_found', error: 'There is nothing waiting for confirmation.' };
  const out = (status, extra = {}) => ({
    ok: true,
    id: row.id,
    tool: row.tool,
    args: row.args,
    summary: row.summary,
    status,
    ...extra
  });

  if (row.status !== 'awaiting_confirmation')
    return out(row.status, { message: `Already ${row.status.replace('_', ' ')}.` });

  let wants = decision;
  if (via === 'voice') {
    if (isNegative(utterance)) wants = 'cancel';
    else if (wants === 'confirm' && !isAffirmative(utterance)) {
      return {
        ok: false,
        status: 'awaiting_confirmation',
        id: row.id,
        error: 'Still waiting: the user has not clearly said yes. Ask them to say "yes" or tap Confirm.'
      };
    }
  }

  if (wants === 'cancel') {
    const won = await actionLog.transition(userId, row.id, 'awaiting_confirmation', 'cancelled');
    return won ? out('cancelled', { message: 'Cancelled. Nothing was done.' }) : out('already_decided');
  }
  if (wants !== 'confirm') return { ok: false, error: 'decision must be "confirm" or "cancel".' };

  if (!isFresh(row.created_at, Date.now())) {
    await actionLog.transition(userId, row.id, 'awaiting_confirmation', 'expired');
    return out('expired', { ok: false, error: 'That request expired. Ask again if you still want it.' });
  }

  // Win the awaiting → confirmed transition first, so a double tap (or a tap and a
  // spoken yes at once) runs the action exactly once.
  const won = await actionLog.transition(userId, row.id, 'awaiting_confirmation', 'confirmed', {
    utterance: via === 'voice' ? String(utterance ?? '').slice(0, 1000) : row.utterance
  });
  if (!won) return out('already_decided', { message: 'Already handled.' });

  const result = await handleToolCall(row.tool, row.args, userId, { tz });
  const status = result?.ok === false ? 'failed' : 'executed';
  await actionLog.transition(userId, row.id, 'confirmed', status, { result }).catch((err) => {
    console.error('[actions] could not record outcome:', err.message);
  });
  return out(status, { ok: status === 'executed', result });
}

export { cancelAllPending, listRecentActions } from './actionLog.js';
