// One confirmation chip for something Nexus did ("Tracking Uber · OA · Fri 6 PM").
// Used by the ⌘K capture bar and the voice panel. Clickable when there's a page to
// open for it; failures render in the danger tone.
import { summarizeTool, chipTarget } from '../../lib/toolSummary.js';
import { cn } from '../../lib/utils.js';

export function ActionChip({ action, onNavigate }) {
  const s = summarizeTool(action.name, action.args, action.result);
  const to = s.ok ? chipTarget(action) : null;
  const Icon = s.icon;
  const body = (
    <>
      <Icon size={14} className={cn('shrink-0', s.ok ? 'text-nexus-primary' : 'text-danger')} />
      <span className="truncate">{s.text}</span>
    </>
  );
  if (to && onNavigate) {
    return (
      <button
        onClick={() => onNavigate(to)}
        className="w-full flex items-center gap-2 rounded-lg bg-nexus-primary/[0.07] border border-nexus-primary/20 px-2.5 py-1.5 text-sm text-text-primary text-left hover:border-nexus-primary/45"
      >
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
