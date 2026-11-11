// "Nexus noticed" — things slipping that aren't visible anywhere else on Today
// (applications gone quiet). Dismiss hides it for good; snooze brings it back later.
import { AnimatePresence, motion } from 'framer-motion';
import { Radar, X } from 'lucide-react';
import { Card } from '../ui/Card.jsx';

export function NoticedCard({ nudges, onAction, onDismiss }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Radar size={15} className="text-nexus-primary" />
        <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-text-muted">Nexus noticed</h2>
      </div>

      {nudges.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Nothing slipping. Nexus flags applications that go quiet for 10+ days so you can follow up.
        </p>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {nudges.map((n) => (
              <motion.li
                key={n.key}
                layout
                exit={{ opacity: 0, height: 0 }}
                className="relative rounded-xl border border-surface-border bg-surface-3/40 p-3 pl-3.5"
              >
                <span className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full bg-warning/70" />
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary">{n.title}</p>
                    {n.detail && <p className="mt-0.5 text-xs text-text-muted">{n.detail}</p>}
                  </div>
                  <button
                    onClick={() => onDismiss(n)}
                    aria-label={`Dismiss: ${n.title}`}
                    className="shrink-0 w-6 h-6 grid place-items-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-3"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {n.actions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => onAction(a)}
                      className="rounded-md border border-surface-border px-2 py-0.5 text-[11px] text-text-secondary hover:text-text-primary hover:border-nexus-primary/50"
                    >
                      {a.label}
                    </button>
                  ))}
                  <button
                    onClick={() => onDismiss(n, { snoozeHours: 72 })}
                    className="px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text-secondary"
                  >
                    Snooze 3d
                  </button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

export default NoticedCard;
