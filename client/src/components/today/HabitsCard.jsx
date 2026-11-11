// Today's habits with one-tap check-in (optimistic, reverts on failure).
import { Link } from 'react-router-dom';
import { Check, Flame } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { habitsApi } from '../../lib/api.js';
import { cn } from '../../lib/utils.js';

export function HabitsCard({ habits, setHabits }) {
  const patch = (id, fields) => setHabits((hs) => hs.map((h) => (h.id === id ? { ...h, ...fields } : h)));

  const toggle = async (habit) => {
    const wasDone = habit.done_today;
    patch(habit.id, { done_today: !wasDone });
    try {
      const res = wasDone ? await habitsApi.uncheckin(habit.id) : await habitsApi.checkin(habit.id);
      patch(habit.id, { current_streak: res.streak });
    } catch {
      patch(habit.id, { done_today: wasDone });
    }
  };

  const done = habits.filter((h) => h.done_today).length;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-text-muted">Habits</h2>
        {habits.length > 0 && (
          <span className="font-mono text-xs text-text-muted tabular-nums">
            {done}/{habits.length}
          </span>
        )}
      </div>
      {habits.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No habits yet.{' '}
          <Link to="/habits" className="text-nexus-primary hover:underline">
            Add one
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-0.5">
          {habits.slice(0, 6).map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-1.5">
              <button
                onClick={() => toggle(h)}
                aria-pressed={h.done_today}
                aria-label={h.done_today ? `Undo ${h.name}` : `Complete ${h.name}`}
                className={cn(
                  'shrink-0 w-6 h-6 rounded-full border grid place-items-center transition-colors',
                  h.done_today
                    ? 'bg-nexus-primary border-nexus-primary text-on-accent'
                    : 'border-surface-border text-text-muted hover:border-nexus-primary/60'
                )}
              >
                {h.done_today && <Check size={13} strokeWidth={3} />}
              </button>
              <span
                className={cn(
                  'flex-1 text-sm truncate',
                  h.done_today ? 'text-text-muted line-through' : 'text-text-primary'
                )}
              >
                {h.name}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-text-secondary tabular-nums">
                <Flame size={13} className={h.current_streak > 0 ? 'text-warning' : 'text-text-muted'} />
                {h.current_streak ?? 0}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default HabitsCard;
