import { create } from 'zustand';

// UI state for voice mode. Written only by lib/voice/engine.js; components read it.
// status: off | connecting | ready | listening | thinking | speaking | error
// turns:  [{ id, heard, cue?, said, actions: [{ name, args, result }], interrupted }]
//         cue = a non-spoken input shown in place of "heard" ("Tapped Confirm").
// confirmations: { [actionId]: { id, summary, status, error } } — risky actions
//         parked by the server's confirmation gate, keyed by action_log id.
export const MAX_TURNS = 30;

export const useVoiceStore = create((set) => ({
  status: 'off',
  error: null,
  turns: [],
  confirmations: {},
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen })
}));
