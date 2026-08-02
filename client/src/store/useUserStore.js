import { create } from 'zustand';

export const useUserStore = create((set) => ({
  user: null,
  session: null,
  loading: true,
  setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ user: null, session: null, loading: false })
}));
