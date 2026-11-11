// Placement pipeline at a glance: one proportional bar (wishlist → offer) plus
// per-stage counts. Counts appear once — in the legend — not on the bar too.
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { STAGES } from '../../lib/applications.js';

export function PipelineCard({ apps, onCapture }) {
  const counts = Object.fromEntries(STAGES.map((s) => [s.id, 0]));
  let closed = 0;
  for (const a of apps) {
    if (a.stage in counts) counts[a.stage] += 1;
    else closed += 1;
  }
  const active = STAGES.reduce((n, s) => n + counts[s.id], 0);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-text-muted">Pipeline</h2>
        <Link
          to="/applications"
          className="inline-flex items-center gap-0.5 text-xs text-nexus-primary hover:underline"
        >
          Board <ArrowUpRight size={13} />
        </Link>
      </div>

      {active === 0 ? (
        <div className="text-sm text-text-secondary">
          No live applications yet.{' '}
          <button onClick={() => onCapture('Applied to ')} className="text-nexus-primary hover:underline">
            Track one
          </button>
          .
        </div>
      ) : (
        <>
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3 gap-[2px]"
            role="img"
            aria-label={STAGES.map((s) => `${s.label} ${counts[s.id]}`).join(', ')}
          >
            {STAGES.filter((s) => counts[s.id] > 0).map((s) => (
              <span key={s.id} style={{ flexGrow: counts[s.id], background: s.color }} className="min-w-[6px]" />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-5 gap-1">
            {STAGES.map((s) => (
              <div key={s.id} className="min-w-0">
                <p className="font-display text-xl font-bold tabular-nums text-text-primary">{counts[s.id]}</p>
                <p className="flex items-center gap-1 text-[10px] text-text-muted truncate">
                  <span className="w-1.5 h-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  {s.label.split(' ')[0]}
                </p>
              </div>
            ))}
          </div>
          {closed > 0 && <p className="mt-3 text-[11px] text-text-muted">{closed} closed</p>}
        </>
      )}
    </Card>
  );
}

export default PipelineCard;
