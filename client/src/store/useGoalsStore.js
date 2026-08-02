// Goals store — goals with nested milestones.
import { create } from 'zustand';

export const useGoalsStore = create((set) => ({
  goals: [],
  loading: false,
  setGoals: (goals) => set({ goals }),
  setLoading: (loading) => set({ loading }),
  upsertGoal: (goal) => set((s) => {
    const idx = s.goals.findIndex(g => g.id === goal.id);
    if (idx === -1) return { goals: [{ milestones: [], ...goal }, ...s.goals] };
    const next = s.goals.slice();
    next[idx] = { ...next[idx], ...goal };
    return { goals: next };
  }),
  removeGoal: (id) => set((s) => ({ goals: s.goals.filter(g => g.id !== id) })),
  setMilestones: (goalId, milestones) => set((s) => ({
    goals: s.goals.map(g => g.id === goalId ? { ...g, milestones } : g)
  }))
}));
