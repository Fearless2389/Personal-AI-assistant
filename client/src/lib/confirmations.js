// Client side of the confirmation gate, shared by voice, chat and ⌘K: tracks risky
// actions the server parked (action_log rows in 'awaiting_confirmation') and applies
// their outcomes. The server decides; this only mirrors its answers for the UI.
import { useConfirmStore } from '../store/useConfirmStore.js';
import { useRefreshStore, keysForTool } from '../store/useRefreshStore.js';
import { actionsApi } from './api.js';

const set = useConfirmStore.setState;
const get = useConfirmStore.getState;

function patch(id, fields) {
  set((s) => ({ confirmations: { ...s.confirmations, [id]: { ...s.confirmations[id], id, ...fields } } }));
}

export const isWaiting = (c) => c?.status === 'awaiting_confirmation';

/** resolve_pending_action gets no chip of its own: its outcome shows on the card. */
export const isShownAction = (a) => a.name !== 'resolve_pending_action';
export const hasWaiting = () => Object.values(get().confirmations).some(isWaiting);
export const waitingIds = () =>
  Object.values(get().confirmations)
    .filter(isWaiting)
    .map((c) => c.id);

/** A tool result came back: start tracking it if the gate parked it. */
export function trackParked(result) {
  if (!result?.needs_confirmation || !result.confirmation_id) return false;
  patch(result.confirmation_id, { summary: result.summary, status: 'awaiting_confirmation', error: null });
  return true;
}

/**
 * Apply a resolve outcome ({ id, tool, status, ok, error, result }) from a tap or
 * resolve_pending_action. Refreshes the affected pages once it executed.
 */
export function applyResolution(res) {
  if (!res?.id) return;
  const error = res.ok === false ? (res.error ?? res.result?.error ?? res.result?.message ?? null) : null;
  // A non-yes leaves it waiting: keep the card's buttons live.
  patch(res.id, { status: res.status === 'not_found' ? 'expired' : res.status, error });
  if (res.status === 'executed') useRefreshStore.getState().bump(...keysForTool(res.tool));
}

/**
 * Every tool result from voice, chat or ⌘K goes through here: parked actions are
 * tracked, resolutions applied, and anything that changed data refreshes its pages.
 */
export function applyToolResult(name, result) {
  if (name === 'resolve_pending_action') return applyResolution(result);
  if (trackParked(result)) return;
  if (result?.ok !== false && !result?.needs_choice) useRefreshStore.getState().bump(...keysForTool(name));
}

/** Button path: the tap is the decision. Returns the server's outcome (or null on network failure). */
export async function resolveByTap(id, decision) {
  if (!isWaiting(get().confirmations[id])) return null;
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

/**
 * Speech path: the user's own transcribed words answer a waiting action. The server
 * decides (clear yes → confirm, clear no → cancel, anything else → still waiting);
 * a non-answer leaves the card untouched rather than flashing an error.
 */
export async function resolveBySpeech(id, utterance) {
  try {
    const { result } = await actionsApi.resolve(id, 'confirm', utterance);
    if (result?.status !== 'awaiting_confirmation') applyResolution(result);
    return result;
  } catch (err) {
    console.warn('[confirm] spoken answer not applied:', err.message);
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
    console.warn('[confirm] cancel-pending failed:', err.message);
  }
  // Anything not confirmed cancelled is re-read as still waiting rather than guessed at.
  for (const c of Object.values(get().confirmations))
    if (c.status === 'working') patch(c.id, { status: 'awaiting_confirmation' });
}
