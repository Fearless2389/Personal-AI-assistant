// Dashboard — the app's home screen. Powered by the morning-briefing workflow
// (calendar + tasks → Gemini structured summary, with a deterministic fallback).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { dashboardApi } from '../lib/api.js';
import { Card } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';

const STAT_TILES = [
  { key: 'overdue', label: 'Overdue', intent: 'danger', to: '/tasks?filter=overdue' },
  { key: 'dueToday', label: 'Due today', intent: 'warning', to: '/tasks?filter=today' },
  { key: 'inProgress', label: 'In progress', intent: 'info', to: '/tasks' },
  { key: 'todo', label: 'To-do', intent: 'neutral', to: '/tasks' }
];

function StatTile({ label, value, intent, to }) {
  const body = (
    <Card className="text-center py-4 hover:border-nexus-primary/40 transition-colors">
      <div className="text-2xl font-display font-semibold text-text-primary tabular-nums">{value ?? 0}</div>
      <div className="mt-0.5 text-xs text-text-secondary">{label}</div>
    </Card>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

function eventTime(e) {
  if (e.all_day) return 'All day';
  try { return format(new Date(e.start_time), 'h:mm a'); } catch { return ''; }
}

function BriefingSkeleton() {
  return (
    <Card className="relative overflow-hidden">
      <div className="space-y-3">
        <LoadingSpinner variant="skeleton" className="h-6 w-48" />
        <LoadingSpinner variant="skeleton" className="h-4 w-72 max-w-full" />
        <div className="pt-2 space-y-2">
          <LoadingSpinner variant="skeleton" className="h-4 w-full" />
          <LoadingSpinner variant="skeleton" className="h-4 w-5/6" />
          <LoadingSpinner variant="skeleton" className="h-4 w-4/6" />
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ refresh = false } = {}) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const payload = await dashboardApi.get({ refresh });
      setData(payload);
    } catch (err) {
      setError(err.message ?? 'Could not load your dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const briefing = data?.briefing;
  const stats = data?.stats ?? {};
  const events = data?.events ?? [];

  return (
    <PageWrapper>
      {/* Hero briefing */}
      {loading && <BriefingSkeleton />}

      {!loading && error && (
        <Card className="border-danger/40 bg-danger/10 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Couldn't load your dashboard</p>
            <p className="text-xs text-text-secondary mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => load()}>Retry</Button>
        </Card>
      )}

      {!loading && !error && briefing && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="relative overflow-hidden">
            {/* time-aware accent bar */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-nexus-primary to-nexus-secondary" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-xl md:text-2xl font-semibold text-text-primary">
                  {briefing.greeting}
                </h1>
                <p className="text-sm text-text-secondary mt-1">{briefing.headline}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {data.generated && <Badge intent="primary">AI briefing</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => load({ refresh: true })}
                  disabled={refreshing}
                  aria-label="Refresh briefing"
                >
                  {refreshing ? <LoadingSpinner /> : '↻'}
                </Button>
              </div>
            </div>

            {briefing.priorities?.length > 0 && (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Today's focus</p>
                <ol className="space-y-2">
                  {briefing.priorities.map((p, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-surface-3 border border-surface-border grid place-items-center text-xs text-text-secondary font-mono">
                        {i + 1}
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="text-sm text-text-primary font-medium">{p.title}</span>
                        {p.reason && <span className="text-sm text-text-secondary"> — {p.reason}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {briefing.nudge && (
              <p className="mt-5 text-sm text-text-secondary border-l-2 border-nexus-primary/50 pl-3">
                {briefing.nudge}
              </p>
            )}

            <div className="mt-5">
              <Link to="/chat">
                <Button size="sm" variant="primary">Plan in chat →</Button>
              </Link>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Stat tiles */}
      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {STAT_TILES.map(t => (
            <StatTile key={t.key} label={t.label} value={stats[t.key]} intent={t.intent} to={t.to} />
          ))}
        </div>
      )}

      {/* Today's schedule */}
      {!loading && !error && (
        <Card className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-text-primary">Today's schedule</h2>
            <Link to="/calendar" className="text-xs text-nexus-primary hover:underline">Calendar →</Link>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Nothing scheduled today.{' '}
              <Link to="/calendar" className="text-nexus-primary hover:underline">
                Connect Google Calendar
              </Link>{' '}
              to see your events here.
            </p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {events.map(e => (
                <li key={e.google_event_id} className="flex gap-3 py-2">
                  <span className="shrink-0 w-20 text-xs font-mono text-text-secondary pt-0.5">{eventTime(e)}</span>
                  <span className="min-w-0">
                    <span className="text-sm text-text-primary truncate block">{e.title}</span>
                    {e.location && <span className="text-xs text-text-muted truncate block">📍 {e.location}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageWrapper>
  );
}
