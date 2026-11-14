import { create } from 'zustand';

// Risky actions the server's confirmation gate parked, from voice, chat or ⌘K,
// keyed by action_log id: { [id]: { id, summary, status, error } }.
// Written only by lib/confirmations.js; components read it.
export const useConfirmStore = create(() => ({ confirmations: {} }));
