import { create } from 'zustand';

// Open state for the global ⌘K capture bar. `seed` pre-fills the input
// (e.g. an empty state's example phrase) without submitting it.
export const useCommandBar = create((set) => ({
  open: false,
  seed: '',
  show: (seed = '') => set({ open: true, seed }),
  hide: () => set({ open: false, seed: '' }),
  toggle: () => set((s) => ({ open: !s.open, seed: '' }))
}));
