// Today — the command centre. Every block loads independently so the slow AI
// briefing never holds the deterministic parts (timeline, pipeline, nudges) hostage.
//
// Duplication rule: dated items render ONLY in the timeline. Deadline/overdue
// nudges become inline actions on their timeline row; "Nexus noticed" shows only
// what appears nowhere else (applications gone quiet).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Sparkles } from 'lucide-react';
import { dashboardApi, agendaApi, nudgesApi, applicationsApi, habitsApi } from '../lib/api.js';
import { useRefreshKey } from '../store/useRefreshStore.js';
import { useCommandBar } from '../store/useCommandBar.js';
import { Card } from '../components/ui/Card.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { Timeline } from '../components/today/Timeline.jsx';
import { PipelineCard } from '../components/today/PipelineCard.jsx';
import { NoticedCard } from '../components/today/NoticedCard.jsx';
import { HabitsCard } from '../components/today/HabitsCard.jsx';

// Nudge kinds Today shows in "Nexus noticed"; the rest attach to timeline rows
// (deadline/overdue) or duplicate other cards (habits, tomorrow, overdue-tasks).
const NOTICED_KINDS = new Set(['follow_up']);

/** Load one block with its own loading/error state; re-runs when `deps` change. */
function useBlock(fetcher, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: s.data === null, error: null }));
    try {
      setState({ data: await fetcher(), loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    run();
  }, [run]);
  return [state, run, setState];
}

function BlockError({ message, onRetry }) {
  return (
    <p className="text-sm text-text-secondary">
      Couldn't load this: <span className="text-text-muted">{message}</span>{' '}
      <button onClick={onRetry} className="text-nexus-primary hover:underline">
        Retry
      </button>
    </p>
  );
}

export default function Today() {
  const navigate = useNavigate();
  const openCapture = useCommandBar((s) => s.show);
  const vApps = useRefreshKey('applications');
  const vAgenda = useRefreshKey('agenda');
  const vNudges = useRefreshKey('nudges');
  const vHabits = useRefreshKey('habits');
  const [refreshing, setRefreshing] = useState(false);

  const [briefing, reloadBriefing, setBriefing] = useBlock(() => dashboardApi.get(), []);
  const [agenda, reloadAgenda] = useBlock(() => agendaApi.get({ days: 7 }).then((r) => r.items ?? []), [vAgenda]);
  const [nudges, reloadNudges, setNudges] = useBlock(() => nudgesApi.list().then((r) => r.nudges ?? []), [vNudges]);
  const [apps, reloadApps] = useBlock(() => applicationsApi.list().then((r) => r.applications ?? []), [vApps]);
  const [habits, , setHabitsState] = useBlock(() => habitsApi.list().then((r) => r.habits ?? []), [vHabits]);

  const setHabits = (updater) => setHabitsState((s) => ({ ...s, data: updater(s.data ?? []) }));

  const refreshBriefing = async () => {
    setRefreshing(true);
    try {
      setBriefing((s) => ({ ...s, data: null, loading: true }));
      const data = await dashboardApi.get({ refresh: true });
      setBriefing({ data, loading: false, error: null });
    } catch (err) {
      setBriefing((s) => ({ ...s, loading: false, error: err.message }));
    } finally {
      setRefreshing(false);
    }
  };

  // Deadline/overdue nudges keyed by application id → inline row actions.
  const rowActions = useMemo(() => {
    const map = new Map();
    for (const n of nudges.data ?? []) {
      const m = /^(due|late):([^:]+):/.exec(n.key);
      if (m) map.set(m[2], n.actions);
    }
    return map;
  }, [nudges.data]);
  const actionsFor = (item) => (item.kind === 'application' ? rowActions.get(item.id) : undefined);

  const noticed = (nudges.data ?? []).filter((n) => NOTICED_KINDS.has(n.kind));

  const runAction = (action) => {
    if (action.to) navigate(action.to);
    else if (action.prompt) navigate('/chat', { state: { draft: action.prompt, autoSend: true } });
  };

  const dismiss = async (nudge, opts) => {
    setNudges((s) => ({ ...s, data: (s.data ?? []).filter((n) => n.key !== nudge.key) }));
    try {
      await nudgesApi.dismiss(nudge.key, opts);
    } catch {
      reloadNudges();
    }
  };

  const b = briefing.data?.briefing;

  return (
    <PageWrapper>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        className="space-y-6"
      >
        {/* Greeting + AI read on the day */}
        <motion.header variants={rise} className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {briefing.loading ? (
              <div className="space-y-2.5 pt-1">
                <div className="h-8 w-64 rounded-lg shimmer" />
                <div className="h-4 w-96 max-w-full rounded shimmer opacity-70" />
              </div>
            ) : briefing.error ? (
              <>
                <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Today</h1>
                <BlockError message={briefing.error} onRetry={reloadBriefing} />
              </>
            ) : (
              <>
                <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-text-primary">
                  {b?.greeting}
                </h1>
                <p className="mt-2 text-text-secondary max-w-2xl">{b?.headline}</p>
                {b?.nudge && (
                  <p className="mt-3 text-sm text-text-muted border-l-2 border-nexus-primary/50 pl-3 max-w-2xl">
                    {b.nudge}
                  </p>
                )}
              </>
            )}
          </div>
          <button
            onClick={refreshBriefing}
            disabled={refreshing || briefing.loading}
            title={briefing.data?.generated ? 'AI briefing. Regenerate' : 'Regenerate briefing'}
            className="shrink-0 w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 disabled:opacity-40"
            aria-label="Regenerate briefing"
          >
            {refreshing ? <LoadingSpinner /> : <RefreshCw size={16} />}
          </button>
        </motion.header>

        {/* Capture hero — the page's one primary action */}
        <motion.button
          variants={rise}
          onClick={() => openCapture()}
          className="group w-full flex items-center gap-3 rounded-2xl border border-surface-border bg-surface-2/80 px-4 py-3.5 text-left hover:border-nexus-primary/45 transition-colors shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
        >
          <Sparkles size={18} className="text-nexus-primary shrink-0" />
          <span className="flex-1 text-text-muted group-hover:text-text-secondary truncate">
            Tell Nexus anything… “Applied to Uber, OA Friday 6pm”
          </span>
          <kbd className="hidden sm:inline font-mono text-[11px] text-text-muted border border-surface-border rounded-md px-1.5 py-0.5">
            Ctrl K
          </kbd>
        </motion.button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Timeline */}
          <motion.div variants={rise} className="lg:col-span-8">
            <Card>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-text-muted">Next 7 days</h2>
                {agenda.data && (
                  <span className="font-mono text-xs text-text-muted tabular-nums">{agenda.data.length} items</span>
                )}
              </div>
              {agenda.loading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-9 rounded-lg shimmer" style={{ opacity: 1 - i * 0.2 }} />
                  ))}
                </div>
              ) : agenda.error ? (
                <BlockError message={agenda.error} onRetry={reloadAgenda} />
              ) : agenda.data.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-text-primary font-medium">Nothing with a deadline this week.</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Tell Nexus about an OA, interview or assignment and it lands here with a countdown.
                  </p>
                </div>
              ) : (
                <Timeline items={agenda.data} actionsFor={actionsFor} onAction={runAction} />
              )}
            </Card>
          </motion.div>

          {/* Right rail */}
          <motion.div variants={rise} className="lg:col-span-4 space-y-4">
            {nudges.error ? (
              <Card>
                <BlockError message={nudges.error} onRetry={reloadNudges} />
              </Card>
            ) : (
              !nudges.loading && <NoticedCard nudges={noticed} onAction={runAction} onDismiss={dismiss} />
            )}
            {apps.data && <PipelineCard apps={apps.data} onCapture={openCapture} />}
            {apps.error && (
              <Card>
                <BlockError message={apps.error} onRetry={reloadApps} />
              </Card>
            )}
            {habits.data && <HabitsCard habits={habits.data} setHabits={setHabits} />}
          </motion.div>
        </div>
      </motion.div>
    </PageWrapper>
  );
}

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } }
};
