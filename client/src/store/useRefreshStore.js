import { create } from 'zustand';

// Tiny cross-page refresh signal. When something changes data behind a page's
// back (the ⌘K capture bar, a chat tool call), bump the matching key and any
// mounted page that reads it refetches. Keys: applications, agenda, nudges, tasks, habits, notes, goals.
export const useRefreshStore = create((set) => ({
  versions: {},
  bump: (...keys) =>
    set((s) => {
      const versions = { ...s.versions };
      for (const k of keys) versions[k] = (versions[k] ?? 0) + 1;
      return { versions };
    })
}));

export function useRefreshKey(key) {
  return useRefreshStore((s) => s.versions[key] ?? 0);
}

// Which views go stale after each chat tool runs.
const TOOL_KEYS = {
  track_application: ['applications', 'agenda', 'nudges'],
  create_task: ['tasks', 'agenda', 'nudges'],
  create_calendar_event: ['agenda'],
  create_note: ['notes'],
  manage_task: ['tasks', 'agenda', 'nudges'],
  manage_habit: ['habits', 'nudges'],
  manage_note: ['notes'],
  manage_goal: ['goals'],
  manage_calendar_event: ['agenda']
};

export function keysForTool(name) {
  return TOOL_KEYS[name] ?? [];
}
