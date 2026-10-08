import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, ListTodo, StickyNote, MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils.js';

const ITEMS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/settings', label: 'More', icon: MoreHorizontal }
];

export function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-1/95 backdrop-blur border-t border-surface-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors',
                isActive ? 'text-nexus-primary' : 'text-text-secondary'
              )
            }
          >
            <Icon size={20} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default MobileNav;
