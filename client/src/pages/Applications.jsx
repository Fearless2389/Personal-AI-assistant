// Applications — the placement pipeline. Desktop: a stage board you drag cards
// across. Mobile: stage chips + one column. Cards open a detail drawer; the
// drawer is URL-addressable (?open=<id>) so nudges can deep-link to a card.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { Plus, ChevronDown, Sparkles, RotateCw } from 'lucide-react';
import { applicationsApi } from '../lib/api.js';
import { STAGES, CLOSED_STAGES, stageMeta, emptyDraft } from '../lib/applications.js';
import { cn } from '../lib/utils.js';
import { useRefreshKey, useRefreshStore } from '../store/useRefreshStore.js';
import { useCommandBar } from '../store/useCommandBar.js';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { ApplicationCard, ApplicationCardBody, Monogram } from '../components/applications/ApplicationCard.jsx';
import { ApplicationDrawer } from '../components/applications/ApplicationDrawer.jsx';
import { ApplicationFields } from '../components/applications/ApplicationFields.jsx';

const CHANNEL_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'on_campus', label: 'On-campus' },
  { id: 'off_campus', label: 'Off-campus' }
];

const EXAMPLES = [
  'Applied to Atlassian SWE intern off-campus, referral from Priya',
  'De Shaw OA this Saturday 6pm',
  'Got shortlisted for the Amazon SDE interview on Monday'
];

// Soonest deadline first, then most recently touched.
function byUrgency(a, b) {
  const da = a.next_deadline ? new Date(a.next_deadline).getTime() : Infinity;
  const db = b.next_deadline ? new Date(b.next_deadline).getTime() : Infinity;
  if (da !== db) return da - db;
  return new Date(b.last_activity_at) - new Date(a.last_activity_at);
}

function Column({ stage, apps, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.label} column`}
      className={cn(
        'relative flex flex-col min-w-[220px] rounded-2xl border bg-surface-2/60 transition-colors',
        isOver ? 'border-nexus-primary/50 bg-surface-2' : 'border-surface-border'
      )}
    >
      <span className="absolute inset-x-4 top-0 h-[2px] rounded-full" style={{ background: stage.color }} />
      <header className="px-3.5 pt-3.5 pb-2 flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-text-secondary">{stage.label}</h2>
        <span className="font-mono text-xs text-text-muted tabular-nums">{apps.length}</span>
      </header>
      <div className="flex-1 px-2.5 pb-2.5 space-y-2 min-h-[140px]">
        {apps.map((a) => (
          <ApplicationCard key={a.id} app={a} onOpen={onOpen} />
        ))}
        {apps.length === 0 && <p className="text-[11px] text-text-muted text-center pt-8">Drop here</p>}
      </div>
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-3" aria-busy="true">
      {STAGES.map((s) => (
        <div key={s.id} className="rounded-2xl border border-surface-border bg-surface-2/60 p-3 space-y-2">
          <div className="h-3 w-20 rounded shimmer" />
          <div className="h-16 rounded-xl shimmer" />
          <div className="h-16 rounded-xl shimmer opacity-60" />
        </div>
      ))}
    </div>
  );
}

export default function Applications() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [channel, setChannel] = useState('all');
  const [mobileStage, setMobileStage] = useState('applied');
  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [params, setParams] = useSearchParams();
  const refreshKey = useRefreshKey('applications');
  const bump = useRefreshStore((s) => s.bump);
  const openCapture = useCommandBar((s) => s.show);

  // (Re)load whenever the refresh key bumps. `alive` drops a response that lands
  // after a newer request started or the page unmounted.
  useEffect(() => {
    let alive = true;
    applicationsApi
      .list()
      .then(({ applications }) => {
        if (!alive) return;
        setApps(applications ?? []);
        setError(null);
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  const load = () => bump('applications');

  const visible = useMemo(
    () => (channel === 'all' ? apps : apps.filter((a) => a.channel === channel)),
    [apps, channel]
  );
  const columns = useMemo(() => {
    const out = Object.fromEntries([...STAGES, ...CLOSED_STAGES].map((s) => [s.id, []]));
    for (const a of visible) (out[a.stage] ?? out.applied).push(a);
    for (const k of Object.keys(out)) out[k].sort(byUrgency);
    return out;
  }, [visible]);
  const closed = [...columns.rejected, ...columns.withdrawn];

  const openId = params.get('open');
  const openApp = apps.find((a) => a.id === openId) ?? null;
  const openCard = (a) => setParams({ open: a.id }, { replace: false });
  const closeDrawer = useCallback(() => setParams({}, { replace: true }), [setParams]);

  const replace = (next) => setApps((list) => list.map((a) => (a.id === next.id ? next : a)));

  const save = async (id, patch) => {
    const { application } = await applicationsApi.update(id, patch);
    replace(application);
    bump('agenda', 'nudges');
  };

  const remove = async (id) => {
    const prev = apps;
    setApps((list) => list.filter((a) => a.id !== id));
    closeDrawer();
    try {
      await applicationsApi.remove(id);
      bump('agenda', 'nudges');
    } catch (err) {
      setApps(prev);
      setError(`Delete failed: ${err.message}`);
    }
  };

  const create = async () => {
    if (!draft.company.trim()) return;
    setCreating(true);
    try {
      const { application } = await applicationsApi.create(draft);
      setApps((list) => [application, ...list]);
      setDraft(emptyDraft());
      setAdding(false);
      bump('agenda', 'nudges');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Drag a card onto another column → optimistic stage change, revert on failure.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = async ({ active, over }) => {
    setDragId(null);
    const app = apps.find((a) => a.id === active.id);
    if (!app || !over || over.id === app.stage) return;
    const optimistic = { ...app, stage: over.id };
    replace(optimistic);
    try {
      const { application } = await applicationsApi.update(app.id, { stage: over.id });
      replace(application);
      bump('agenda', 'nudges');
    } catch (err) {
      replace(app);
      setError(`Couldn't move ${app.company}: ${err.message}`);
    }
  };
  const dragging = apps.find((a) => a.id === dragId);

  const activeCount = STAGES.reduce((n, s) => n + columns[s.id].length, 0);

  return (
    <PageWrapper className="max-w-[1400px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div
          role="tablist"
          aria-label="Channel"
          className="inline-flex rounded-xl border border-surface-border bg-surface-2/60 p-1"
        >
          {CHANNEL_FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={channel === f.id}
              onClick={() => setChannel(f.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition-colors',
                channel === f.id ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs text-text-muted font-mono tabular-nums">{activeCount} active</span>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm">
          <span className="text-text-primary">{error}</span>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <RotateCw size={13} /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <BoardSkeleton />
      ) : apps.length === 0 && !error ? (
        <EmptyPipeline onAdd={() => setAdding(true)} onCapture={openCapture} />
      ) : (
        <>
          {/* Desktop board */}
          <DndContext
            sensors={sensors}
            onDragStart={({ active }) => setDragId(active.id)}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragId(null)}
          >
            <div className="hidden md:grid grid-cols-5 gap-3 overflow-x-auto pb-2">
              {STAGES.map((s) => (
                <Column key={s.id} stage={s} apps={columns[s.id]} onOpen={openCard} />
              ))}
            </div>
            <DragOverlay>{dragging ? <ApplicationCardBody app={dragging} dragging /> : null}</DragOverlay>
          </DndContext>

          {/* Mobile: stage chips + single column */}
          <div className="md:hidden">
            <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-3">
              {STAGES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setMobileStage(s.id)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs',
                    mobileStage === s.id
                      ? 'border-transparent bg-surface-3 text-text-primary'
                      : 'border-surface-border text-text-secondary'
                  )}
                  style={mobileStage === s.id ? { boxShadow: `inset 0 0 0 1px ${s.color}` } : undefined}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                  <span className="font-mono text-text-muted">{columns[s.id].length}</span>
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {columns[mobileStage].map((a) => (
                <ApplicationCard key={a.id} app={a} onOpen={openCard} draggable={false} />
              ))}
              {columns[mobileStage].length === 0 && (
                <p className="text-sm text-text-muted text-center py-10">Nothing in {stageMeta(mobileStage).label}.</p>
              )}
            </div>
          </div>

          {/* Closed */}
          {closed.length > 0 && (
            <section className="mt-6">
              <button
                onClick={() => setShowClosed((v) => !v)}
                aria-expanded={showClosed}
                className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-text-muted hover:text-text-secondary"
              >
                <ChevronDown size={14} className={cn('transition-transform', showClosed && 'rotate-180')} />
                Closed ({closed.length})
              </button>
              {showClosed && (
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {closed.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => openCard(a)}
                        className="w-full flex items-center gap-2.5 rounded-xl border border-surface-border bg-surface-2/40 px-3 py-2 text-left opacity-70 hover:opacity-100"
                      >
                        <Monogram company={a.company} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-text-primary truncate">{a.company}</span>
                          <span className="block text-[11px] text-text-muted truncate">
                            {[a.role, stageMeta(a.stage).label].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Track an application"
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={create} disabled={!draft.company.trim() || creating}>
              {creating ? 'Saving…' : 'Track it'}
            </Button>
          </>
        }
      >
        <ApplicationFields value={draft} onChange={setDraft} autoFocus />
      </Modal>

      <ApplicationDrawer app={openApp} onClose={closeDrawer} onSave={save} onDelete={remove} />
    </PageWrapper>
  );
}

function EmptyPipeline({ onAdd, onCapture }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-border bg-surface-2/40 px-6 py-14 text-center">
      <p className="font-display text-2xl font-bold tracking-tight text-text-primary">
        Your placement pipeline lives here
      </p>
      <p className="mt-2 text-sm text-text-secondary max-w-lg mx-auto">
        Tell Nexus the way you'd text a friend. It creates the card, sets the deadline and moves it along as you update
        it.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => onCapture(ex)}
            className="group inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-2/70 px-3.5 py-2 text-sm text-text-secondary hover:text-text-primary hover:border-nexus-primary/50 transition-colors"
          >
            <Sparkles size={13} className="text-nexus-primary" /> “{ex}”
          </button>
        ))}
      </div>
      <button
        onClick={onAdd}
        className="mt-6 text-xs text-text-muted hover:text-text-secondary underline underline-offset-4"
      >
        or add one manually
      </button>
    </div>
  );
}
