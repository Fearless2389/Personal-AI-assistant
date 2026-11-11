// Detail drawer for one application: edit every field, see the stage history,
// open the posting, or delete (two-step, so a stray click can't lose a card).
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { ApplicationFields } from './ApplicationFields.jsx';
import { Monogram, CountdownChip } from './ApplicationCard.jsx';
import { stageMeta } from '../../lib/applications.js';
import { formatRelative } from '../../lib/utils.js';

const EDITABLE = ['company', 'role', 'channel', 'stage', 'next_step', 'next_deadline', 'link', 'notes'];

function pickDraft(app) {
  return Object.fromEntries(EDITABLE.map((k) => [k, app?.[k] ?? (k === 'next_deadline' ? null : '')]));
}

// null and '' both mean "empty" — compare on that basis so an untouched form isn't "dirty".
const norm = (v) => v ?? '';

/** Mounted fresh per opened card (keyed by id), so its state never leaks between cards. */
export function ApplicationDrawer({ app, ...rest }) {
  return <AnimatePresence>{app && <DrawerPanel key={app.id} app={app} {...rest} />}</AnimatePresence>;
}

function DrawerPanel({ app, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => pickDraft(app));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dirty = useMemo(() => EDITABLE.some((k) => norm(draft[k]) !== norm(app[k])), [app, draft]);

  const save = async () => {
    if (!draft.company.trim()) return setError('Company is required.');
    setSaving(true);
    setError(null);
    try {
      const patch = Object.fromEntries(
        EDITABLE.filter((k) => norm(draft[k]) !== norm(app[k])).map((k) => [k, draft[k] === '' ? null : draft[k]])
      );
      await onSave(app.id, patch);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const history = [...(app?.stage_history ?? [])].reverse();

  return (
    <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${app.company} application`}
        className="absolute right-0 top-0 h-full w-full max-w-lg bg-surface-1 border-l border-surface-border shadow-2xl flex flex-col"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <header className="px-5 py-4 border-b border-surface-border flex items-start gap-3">
          <Monogram company={app.company} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-text-primary truncate">{app.company}</h2>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: stageMeta(app.stage).color }} />
                {stageMeta(app.stage).label}
              </span>
              <CountdownChip iso={app.next_deadline} />
              <span className="text-[11px] text-text-muted">updated {formatRelative(app.last_activity_at)}</span>
            </div>
          </div>
          {app.link && (
            <a
              href={app.link}
              target="_blank"
              rel="noreferrer"
              className="w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3"
              aria-label="Open posting"
            >
              <ExternalLink size={16} />
            </a>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
          <ApplicationFields value={draft} onChange={setDraft} showClosedStages />

          {history.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted mb-3">History</p>
              <ol className="relative border-l border-surface-border ml-1.5 space-y-3">
                {history.map((h, i) => (
                  <li key={`${h.stage}-${h.at}-${i}`} className="pl-4 relative">
                    <span
                      className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-surface-1"
                      style={{ background: stageMeta(h.stage).color }}
                    />
                    <p className="text-sm text-text-primary">{stageMeta(h.stage).label}</p>
                    <p className="text-[11px] text-text-muted">
                      {new Date(h.at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-surface-border flex items-center gap-2">
          {confirmDelete ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
              <Button variant="danger" size="sm" onClick={() => onDelete(app.id)}>
                Delete for good
              </Button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-danger px-2 py-1.5 rounded-lg"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <div className="flex-1 min-w-0 text-right">
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </motion.aside>
    </motion.div>
  );
}

export default ApplicationDrawer;
