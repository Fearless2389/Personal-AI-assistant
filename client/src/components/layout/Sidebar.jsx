import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  StickyNote,
  ListTodo,
  CalendarDays,
  Repeat,
  Target,
  Timer,
  BarChart3,
  ScrollText,
  Settings
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

const ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/review', label: 'Review', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 h-screen sticky top-0 bg-surface-1 border-r border-surface-border">
      <div className="px-5 py-5 border-b border-surface-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-nexus-primary to-nexus-secondary grid place-items-center font-display font-bold text-white shadow-lg shadow-nexus-primary/20">
            N
          </div>
          <div>
            <p className="font-display font-semibold text-text-primary leading-none tracking-tight">Nexus</p>
            <p className="text-[11px] text-text-muted mt-1">Second brain</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                isActive
                  ? 'bg-surface-2 text-text-primary'
                  : 'text-text-secondary hover:bg-surface-2/60 hover:text-text-primary'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-nexus-primary transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Icon
                  size={18}
                  strokeWidth={2}
                  className={cn(
                    'shrink-0',
                    isActive ? 'text-nexus-primary' : 'text-text-muted group-hover:text-text-secondary'
                  )}
                />
                <span className="flex-1">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-surface-border text-[11px] text-text-muted">Nexus · v1.0</div>
    </aside>
  );
}

export default Sidebar;
