// A risky action parked by the server's confirmation gate ("Delete the task …",
// "Add 'Uber OA' to your Google Calendar on …"). Confirm / Cancel here, or answer
// in words. Once decided it stays as a one-line record of what happened.
// onDecide defaults to a plain tap; voice passes one that also tells Nexus.
import { ShieldCheck } from 'lucide-react';
import { useConfirmStore } from '../../store/useConfirmStore.js';
import { isWaiting, resolveByTap } from '../../lib/confirmations.js';
import { actionStatusMeta } from '../../lib/actionStatus.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { cn } from '../../lib/utils.js';

export function ConfirmCard({ id, onDecide = resolveByTap, hint = 'or say "yes"' }) {
  const c = useConfirmStore((s) => s.confirmations[id]);
  if (!c) return null;
  const waiting = isWaiting(c);
  const meta = actionStatusMeta(c.status);

  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2 text-sm',
        waiting ? 'border-warning/40 bg-warning/[0.06]' : 'border-surface-border'
      )}
    >
      <div className="flex items-start gap-2">
        <ShieldCheck size={14} className={cn('mt-0.5 shrink-0', waiting ? 'text-warning' : 'text-text-muted')} />
        <p className="flex-1 min-w-0 text-text-primary">{c.summary}</p>
        <Badge intent={meta.intent} className="shrink-0">
          {meta.label}
        </Badge>
      </div>
      {c.error && <p className="mt-1.5 ml-6 text-xs text-danger">{c.error}</p>}
      {waiting && (
        <div className="mt-2 ml-6 flex items-center gap-2">
          <Button size="sm" onClick={() => onDecide(id, 'confirm')}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecide(id, 'cancel')}>
            Cancel
          </Button>
          {hint && <span className="text-xs text-text-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}

export default ConfirmCard;
