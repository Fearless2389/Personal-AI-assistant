// Next-7-days timeline — the ONLY place dated items render on Today. Grouped by
// day (overdue first), with a "now" marker inside today. Deadline/overdue nudges
// attach to their row as inline actions instead of repeating in a second list.
import { Fragment } from 'react';
import { Briefcase, CheckSquare, CalendarDays } from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { cn } from '../../lib/utils.js';
import { CountdownChip } from '../applications/ApplicationCard.jsx';
import { useNow } from '../../hooks/useNow.js';

const KIND_ICON = { application: Briefcase, task: CheckSquare, event: CalendarDays };

function dayKey(item) {
  if (item.overdue) return 'overdue';
  return format(new Date(item.at), 'yyyy-MM-dd');
}

function dayLabel(key) {
  if (key === 'overdue') return 'Overdue';
  const d = new Date(`${key}T00:00:00`);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE d MMM');
}

function timeLabel(item) {
  if (item.all_day) return 'All day';
  const d = new Date(item.at);
  return item.overdue ? format(d, 'd MMM') : format(d, 'h:mm a');
}

function NowMarker() {
  return (
    <li aria-label="Now" className="flex items-center gap-2 py-1">
      <span className="w-14 text-right font-mono text-[10px] uppercase tracking-wider text-nexus-primary">now</span>
      <span className="w-2 h-2 rounded-full bg-nexus-primary signal-glow" />
      <span className="flex-1 h-px bg-gradient-to-r from-nexus-primary/60 to-transparent" />
    </li>
  );
}

function Row({ item, actions, onAction }) {
  const Icon = KIND_ICON[item.kind] ?? CheckSquare;
  const showCountdown = item.kind !== 'event';
  return (
    <li className="group flex items-start gap-2 py-2">
      <span
        className={cn(
          'w-14 shrink-0 text-right font-mono text-[11px] pt-0.5 tabular-nums',
          item.overdue ? 'text-danger' : 'text-text-muted'
        )}
      >
        {timeLabel(item)}
      </span>
      <span
        className={cn(
          'mt-0.5 w-5 h-5 shrink-0 grid place-items-center rounded-md',
          item.kind === 'application' ? 'text-nexus-primary bg-nexus-primary/10' : 'text-text-secondary bg-surface-3'
        )}
      >
        <Icon size={12} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-text-primary leading-snug">{item.title}</p>
          {showCountdown && <CountdownChip iso={item.at} className="shrink-0 mt-px" />}
        </div>
        {item.detail && <p className="text-xs text-text-muted truncate">{item.detail}</p>}
        {actions?.length > 0 && (
          <div className="mt-1.5 flex gap-1.5">
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={() => onAction(a)}
                className="rounded-md border border-surface-border px-2 py-0.5 text-[11px] text-text-secondary hover:text-text-primary hover:border-nexus-primary/50 transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function Timeline({ items, actionsFor, onAction }) {
  const now = useNow(); // ticks each minute so the "now" marker and countdowns stay live
  const groups = [];
  for (const item of items) {
    const key = dayKey(item);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const today = g.key !== 'overdue' && isToday(new Date(`${g.key}T00:00:00`));
        const nowIndex = today ? g.items.findIndex((i) => new Date(i.at).getTime() >= now) : -1;
        return (
          <section key={g.key}>
            <h3
              className={cn(
                'text-[11px] uppercase tracking-[0.16em] font-semibold mb-1 pl-16',
                g.key === 'overdue' ? 'text-danger' : today ? 'text-nexus-primary' : 'text-text-muted'
              )}
            >
              {dayLabel(g.key)}
            </h3>
            <ul>
              {g.items.map((item, i) => (
                <Fragment key={`${item.kind}-${item.id}`}>
                  {today && i === nowIndex && <NowMarker />}
                  <Row item={item} actions={actionsFor(item)} onAction={onAction} />
                </Fragment>
              ))}
              {today && nowIndex === -1 && <NowMarker />}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default Timeline;
