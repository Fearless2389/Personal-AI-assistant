// One application on the board. Draggable between stage columns (desktop);
// click opens the detail drawer. Shows only what helps triage at a glance:
// who, what, channel, the next step and how close it is.
import { useDraggable } from '@dnd-kit/core';
import { Hourglass } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { monogramStyle, countdown, TONE_CLASS, quietDays, stageMeta } from '../../lib/applications.js';

const QUIET_WARN_DAYS = 10;

export function CountdownChip({ iso, className }) {
  const c = countdown(iso);
  if (!c) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none tabular-nums',
        TONE_CLASS[c.tone],
        className
      )}
    >
      {c.label}
    </span>
  );
}

export function Monogram({ company, size = 'md' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 grid place-items-center rounded-lg border font-display font-bold',
        size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
      )}
      style={monogramStyle(company)}
    >
      {(company?.trim()?.[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function ApplicationCardBody({ app, dragging = false }) {
  const quiet = app.stage === 'applied' && !app.next_deadline ? quietDays(app) : 0;
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface-3/70 p-3 text-left transition-all',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
        dragging
          ? 'border-nexus-primary/50 shadow-xl rotate-[1.5deg]'
          : 'border-surface-border hover:border-text-muted/50'
      )}
    >
      <div className="flex items-start gap-2.5">
        <Monogram company={app.company} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm text-text-primary truncate">{app.company}</p>
            <span className="shrink-0 font-mono text-[9px] tracking-wider text-text-muted border border-surface-border rounded px-1 py-px">
              {app.channel === 'on_campus' ? 'ON' : 'OFF'}
            </span>
          </div>
          {app.role && <p className="text-xs text-text-secondary truncate">{app.role}</p>}
        </div>
      </div>

      {(app.next_step || app.next_deadline) && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-xs text-text-secondary truncate">{app.next_step || 'Next step'}</p>
          <CountdownChip iso={app.next_deadline} />
        </div>
      )}

      {quiet >= QUIET_WARN_DAYS && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-warning">
          <Hourglass size={11} /> quiet {quiet}d
        </p>
      )}
    </div>
  );
}

export function ApplicationCard({ app, onOpen, draggable = true }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: app.id,
    data: { stage: app.stage },
    disabled: !draggable
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onOpen(app)}
      aria-label={`${app.company}${app.role ? `, ${app.role}` : ''}, ${stageMeta(app.stage).label}`}
      className={cn(
        'block w-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary/50',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-30'
      )}
    >
      <ApplicationCardBody app={app} />
    </button>
  );
}

export default ApplicationCard;
