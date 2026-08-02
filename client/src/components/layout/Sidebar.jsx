import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils.js';

const ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',  icon: '◐' },
  { to: '/chat',       label: 'Chat',       icon: '✦' },
  { to: '/notes',      label: 'Notes',      icon: '◇' },
  { to: '/tasks',      label: 'Tasks',      icon: '☑' },
  { to: '/calendar',   label: 'Calendar',   icon: '◰' },
  { to: '/habits',     label: 'Habits',     icon: '◯' },
  { to: '/goals',      label: 'Goals',      icon: '◬' },
  { to: '/focus',      label: 'Focus',      icon: '◉' },
  { to: '/analytics',  label: 'Analytics',  icon: '◫' },
  { to: '/review',     label: 'Review',     icon: '✎' },
  { to: '/settings',   label: 'Settings',   icon: '⚙' }
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 h-screen sticky top-0 bg-surface-1 border-r border-surface-border">
      <div className="px-5 py-5 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-nexus-primary to-nexus-secondary grid place-items-center font-display font-bold text-white">
            N
          </div>
          <div>
            <p className="font-display font-semibold text-text-primary leading-none">Nexus</p>
            <p className="text-xs text-text-muted mt-1">Second brain</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn(
              'group flex items-center gap-3 px-3 py-2 rounded-lg text-sm border-l-2',
              isActive
                ? 'bg-surface-2 text-text-primary border-nexus-primary'
                : 'border-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary'
            )}
          >
            <span className="w-5 text-center text-text-muted group-hover:text-text-secondary">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.phase && item.phase > 1 && (
              <span className="text-[10px] uppercase tracking-wider text-text-muted">soon</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-surface-border text-xs text-text-muted">
        Phase 2 · v0.2
      </div>
    </aside>
  );
}

export default Sidebar;
