import { create } from 'zustand';

export const useNotesStore = create((set) => ({
  notes: [],
  activeNoteId: null,
  loading: false,
  semantic: false,
  setNotes: (notes, { semantic = false } = {}) => set({ notes, semantic }),
  setActive: (activeNoteId) => set({ activeNoteId }),
  upsert: (note) =>
    set((s) => {
      const idx = s.notes.findIndex((n) => n.id === note.id);
      if (idx === -1) return { notes: [note, ...s.notes] };
      const next = s.notes.slice();
      next[idx] = { ...next[idx], ...note };
      return { notes: next };
    }),
  remove: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  setLoading: (loading) => set({ loading })
}));
