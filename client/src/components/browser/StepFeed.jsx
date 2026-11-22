// The steps a browser task took, newest last: "✓ 5  Sorted by price  amazon.in". Shows the last
// three; "Show all" expands. Used inside TaskCard.
import { useState } from 'react';
import { Check, X, ShieldX, Ban, Hourglass } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { hostOf } from '../../lib/browserFormat.js';

const ICON = {
  done: { Icon: Check, cls: 'text-success' },
  failed: { Icon: X, cls: 'text-danger' },
  blocked: { Icon: ShieldX, cls: 'text-danger' },
  declined: { Icon: Ban, cls: 'text-text-muted' },
  waiting: { Icon: Hourglass, cls: 'text-warning' }
};
const SHOWN = 3;

export function StepFeed({ steps }) {
  const [all, setAll] = useState(false);
  if (!steps?.length) return null;
  const shown = all ? steps : steps.slice(-SHOWN);

  return (
    <div className="space-y-1">
      {steps.length > SHOWN && (
        <button onClick={() => setAll((v) => !v)} className="text-xs text-text-muted hover:text-text-secondary">
          {all ? 'Show fewer' : `Show all ${steps.length} steps`}
        </button>
      )}
      <ol className="space-y-1">
        {shown.map((s) => {
          const { Icon, cls } = ICON[s.status] ?? ICON.done;
          return (
            <li key={s.n} className="flex items-start gap-2 text-xs" title={s.note ?? undefined}>
              <Icon size={13} className={cn('mt-px shrink-0', cls)} aria-label={s.status} />
              <span className="w-5 shrink-0 text-right tabular-nums text-text-muted">{s.n}</span>
              <span className="flex-1 min-w-0 text-text-secondary break-words">
                {s.label}
                {s.status !== 'done' && s.note && <span className="text-text-muted"> · {s.note}</span>}
              </span>
              <span className="hidden sm:inline shrink-0 text-text-muted">{hostOf(s.url)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default StepFeed;
