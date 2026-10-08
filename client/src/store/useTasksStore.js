import { create } from 'zustand';

const COLUMNS = ['todo', 'in_progress', 'done'];

export const useTasksStore = create((set, get) => ({
  tasks: [],
  loading: false,
  setTasks: (tasks) => set({ tasks }),
  setLoading: (loading) => set({ loading }),
  upsert: (task) =>
    set((s) => {
      const idx = s.tasks.findIndex((t) => t.id === task.id);
      if (idx === -1) return { tasks: [task, ...s.tasks] };
      const next = s.tasks.slice();
      next[idx] = { ...next[idx], ...task };
      return { tasks: next };
    }),
  remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  byStatus: () => {
    const out = Object.fromEntries(COLUMNS.map((c) => [c, []]));
    for (const t of get().tasks) {
      const col = COLUMNS.includes(t.status) ? t.status : 'todo';
      out[col].push(t);
    }
    return out;
  }
}));

export const TASK_COLUMNS = COLUMNS;
