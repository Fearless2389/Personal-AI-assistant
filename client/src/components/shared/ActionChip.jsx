// One confirmation chip for something Nexus did ("Tracking Uber · OA · Fri 6 PM").
// Used by the ⌘K capture bar and the voice panel. Clickable when there's a page to
// open for it (or a website, for open_website); failures render in the danger tone.
// Changes to Rama's own data get an Undo button beside the chip.
import { summarizeTool, chipTarget } from '../../lib/toolSummary.js';
import { UndoButton } from './UndoButton.jsx';
import { cn } from '../../lib/utils.js';

export function ActionChip({ action, onNavigate }) {
  const undoId = action.result?.undoable ? action.result.action_id : null;
  if (!undoId) return <Chip action={action} onNavigate={onNavigate} />;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 min-w-0">
        <Chip action={action} onNavigate={onNavigate} />
      </div>
      <UndoButton actionId={undoId} />
    </div>
  );
}

function Chip({ action, onNavigate }) {
  const s = summarizeTool(action.name, action.args, action.result);
  const to = s.ok ? chipTarget(action) : null;
  const Icon = s.icon;
  const body = (
    <>
      <Icon size={14} className={cn('shrink-0', s.ok ? 'text-nexus-primary' : 'text-danger')} />
      <span className="truncate">{s.text}</span>
    </>
  );
  const linkClass =
    'w-full flex items-center gap-2 rounded-lg bg-nexus-primary/[0.07] border border-nexus-primary/20 px-2.5 py-1.5 text-sm text-text-primary text-left hover:border-nexus-primary/45';
  if (s.ok && s.href) {
    return (
      <a href={s.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {body}
      </a>
    );
  }
  if (to && onNavigate) {
    return (
      <button onClick={() => onNavigate(to)} className={linkClass}>
        {body}
      </button>
    );
  }
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm',
        s.ok ? 'border-surface-border text-text-secondary' : 'border-danger/30 bg-danger/[0.07] text-text-primary'
      )}
    >
      {body}
    </div>
  );
}

export default ActionChip;
