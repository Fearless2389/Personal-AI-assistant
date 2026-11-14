import { create } from 'zustand';

// UI state for voice mode. Written only by lib/voice/engine.js; components read it.
// status: off | connecting | ready | listening | thinking | speaking | error
// turns:  [{ id, heard, said, actions: [{ name, args, result }], interrupted }]
export const MAX_TURNS = 30;

export const useVoiceStore = create((set) => ({
  status: 'off',
  error: null,
  turns: [],
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen })
}));
