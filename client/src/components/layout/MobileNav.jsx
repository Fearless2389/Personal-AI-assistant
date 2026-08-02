import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils.js';

const ITEMS = [
  { to: '/dashboard', label: 'Home',  icon: '◐' },
  { to: '/chat',      label: 'Chat',  icon: '✦' },
  { to: '/tasks',     label: 'Tasks', icon: '☑' },
  { to: '/notes',     label: 'Notes', icon: '◇' },
  { to: '/settings',  label: 'More',  icon: '⋯' }
];

export function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-1/95 backdrop-blur border-t border-surface-border">
      <div className="grid grid-cols-5">
        {ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn(
              'flex flex-col items-center justify-center py-2 text-[11px]',
              isActive ? 'text-nexus-primary' : 'text-text-secondary'
            )}
          >
            <span className="text-lg leading-none mb-1">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default MobileNav;
