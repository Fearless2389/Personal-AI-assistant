// Client side of the confirmation gate: tracks risky actions the server parked
// (action_log rows in 'awaiting_confirmation') and applies their outcomes. The
// server decides; this only mirrors its answers into useVoiceStore for the UI.
import { useVoiceStore } from '../../store/useVoiceStore.js';
import { useRefreshStore, keysForTool } from '../../store/useRefreshStore.js';
import { actionsApi } from '../api.js';

const set = useVoiceStore.setState;
const get = useVoiceStore.getState;

function patch(id, fields) {
  set((s) => ({ confirmations: { ...s.confirmations, [id]: { ...s.confirmations[id], id, ...fields } } }));
}

export const isWaiting = (c) => c?.status === 'awaiting_confirmation';
export const hasWaiting = () => Object.values(get().confirmations).some(isWaiting);

/** A tool result came back from /api/voice/tool: start tracking it if it was parked. */
export function trackParked(result) {
  if (!result?.needs_confirmation || !result.confirmation_id) return false;
  patch(result.confirmation_id, { summary: result.summary, status: 'awaiting_confirmation', error: null });
  return true;
}

/**
 * Apply a resolve outcome ({ id, tool, status, ok, error, result }) from either the
 * button or resolve_pending_action. Refreshes the affected pages once it executed.
 */
export function applyResolution(res) {
  if (!res?.id) return;
  const error = res.ok === false ? (res.error ?? res.result?.error ?? res.result?.message ?? null) : null;
  // A spoken non-yes leaves it waiting: keep the card's buttons live.
  patch(res.id, { status: res.status === 'not_found' ? 'expired' : res.status, error });
  if (res.status === 'executed') useRefreshStore.getState().bump(...keysForTool(res.tool));
}

/** Button path: the tap is the decision. Returns the server's outcome (or null on network failure). */
export async function resolveByTap(id, decision) {
  const before = get().confirmations[id];
  if (!isWaiting(before)) return null;
  patch(id, { status: 'working', error: null });
  try {
    const { result } = await actionsApi.resolve(id, decision);
    applyResolution(result);
    return result;
  } catch (err) {
    patch(id, { status: 'awaiting_confirmation', error: err.message || 'Could not reach Nexus.' });
    return null;
  }
}

/** Kill switch: cancel everything still waiting, on the server and on screen. */
export async function cancelAllWaiting() {
  if (!hasWaiting()) return;
  for (const c of Object.values(get().confirmations)) if (isWaiting(c)) patch(c.id, { status: 'working' });
  try {
    const { cancelled } = await actionsApi.cancelPending();
    for (const id of cancelled) if (get().confirmations[id]) patch(id, { status: 'cancelled', error: null });
  } catch (err) {
    console.warn('[voice] cancel-pending failed:', err.message);
  }
  // Anything not confirmed cancelled is re-read as still waiting rather than guessed at.
  for (const c of Object.values(get().confirmations))
    if (c.status === 'working') patch(c.id, { status: 'awaiting_confirmation' });
}
