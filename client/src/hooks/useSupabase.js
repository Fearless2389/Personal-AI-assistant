import { useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { useUserStore } from '../store/useUserStore.js';

export { supabase };

/**
 * Hydrates the auth state once on mount and subscribes to changes.
 * Mount this at the top of the app (e.g., inside App.jsx).
 */
export function useAuthSync() {
  const setSession = useUserStore(s => s.setSession);
  const setLoading = useUserStore(s => s.setLoading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSession(data.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setSession(session ?? null);
    });
    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [setSession, setLoading]);
}

export function useUser() {
  return useUserStore(s => s.user);
}

export function useSession() {
  return useUserStore(s => s.session);
}

export function useAuthLoading() {
  return useUserStore(s => s.loading);
}
