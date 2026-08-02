// Habits store — today's check-ins + streaks.
import { create } from 'zustand';

export const useHabitsStore = create((set) => ({
  habits: [],
  loading: false,
  setHabits: (habits) => set({ habits }),
  setLoading: (loading) => set({ loading }),
  upsert: (habit) => set((s) => {
    const idx = s.habits.findIndex(h => h.id === habit.id);
    if (idx === -1) return { habits: [...s.habits, habit] };
    const next = s.habits.slice();
    next[idx] = { ...next[idx], ...habit };
    return { habits: next };
  }),
  remove: (id) => set((s) => ({ habits: s.habits.filter(h => h.id !== id) }))
}));
