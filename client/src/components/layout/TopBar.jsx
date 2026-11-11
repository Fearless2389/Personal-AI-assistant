import { useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useUser } from '../../hooks/useSupabase.js';
import { useCommandBar } from '../../store/useCommandBar.js';
import { Button } from '../ui/Button.jsx';

const TITLES = {
  '/dashboard': 'Today',
  '/applications': 'Applications',
  '/chat': 'Chat',
  '/notes': 'Notes',
  '/tasks': 'Tasks',
  '/calendar': 'Calendar',
  '/habits': 'Habits',
  '/goals': 'Goals',
  '/focus': 'Focus',
  '/analytics': 'Analytics',
  '/review': 'Weekly Review',
  '/settings': 'Settings'
};

export function TopBar() {
  const { pathname } = useLocation();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const initial = (user?.email?.[0] ?? '?').toUpperCase();
  const openCapture = useCommandBar((s) => s.show);
  const showCapture = pathname !== '/dashboard'; // Today has its own capture hero

  return (
    <header className="sticky top-0 z-30 bg-surface-base/80 backdrop-blur border-b border-surface-border">
      <div className="px-4 md:px-6 h-14 flex items-center justify-between">
        <h1 className="font-display text-base font-semibold tracking-tight">{TITLES[pathname] ?? 'Nexus'}</h1>
        <div className="flex-1 flex justify-end px-3">
          {showCapture && (
            <button
              onClick={() => openCapture()}
              aria-label="Tell Nexus anything"
              className="inline-flex items-center gap-2 h-9 rounded-xl border border-surface-border bg-surface-2/70 px-2.5 sm:px-3 text-sm text-text-muted hover:text-text-secondary hover:border-nexus-primary/45 transition-colors sm:w-72"
            >
              <Sparkles size={15} className="text-nexus-primary" />
              <span className="hidden sm:inline flex-1 text-left truncate">Tell Nexus anything…</span>
              <kbd className="hidden sm:inline font-mono text-[10px] border border-surface-border rounded px-1 py-px">
                Ctrl K
              </kbd>
            </button>
          )}
        </div>
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-nexus-primary to-nexus-secondary text-on-accent font-display font-semibold grid place-items-center hover:opacity-90"
            aria-label="Account"
          >
            {initial}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-surface-2 border border-surface-border shadow-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-surface-border">
                <p className="text-xs text-text-muted">Signed in as</p>
                <p className="text-sm text-text-primary truncate">{user?.email ?? '—'}</p>
              </div>
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={async () => {
                    setOpen(false);
                    await supabase.auth.signOut();
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopBar;
