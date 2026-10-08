// Dashboard — the home screen. Bento layout: AI briefing hero + right rail of
// quick-jump and stats, with today's habits and schedule below.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, MapPin, MessageSquare, StickyNote, ListTodo, Timer, Flame, Check, ArrowUpRight } from 'lucide-react';
import { format } from 'date-fns';
import { dashboardApi, habitsApi } from '../lib/api.js';
import { Card } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';

const STAT_TILES = [
  { key: 'overdue', label: 'Overdue', to: '/tasks?filter=overdue', accent: 'text-danger' },
  { key: 'dueToday', label: 'Due today', to: '/tasks?filter=today', accent: 'text-warning' },
  { key: 'inProgress', label: 'In progress', to: '/tasks', accent: 'text-nexus-primary' },
  { key: 'todo', label: 'To-do', to: '/tasks', accent: 'text-text-secondary' }
];

const QUICK = [
  { to: '/chat', label: 'Ask Nexus', icon: MessageSquare },
  { to: '/notes', label: 'New note', icon: StickyNote },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/focus', label: 'Focus', icon: Timer }
];

function eventTime(e) {
  if (e.all_day) return 'All day';
  try { return format(new Date(e.start_time), 'h:mm a'); } catch { return ''; }
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ refresh = false } = {}) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [payload, h] = await Promise.all([
        dashboardApi.get({ refresh }),
        habitsApi.list().catch(() => ({ habits: [] }))
      ]);
      setData(payload);
      setHabits(h.habits ?? []);
    } catch (err) {
      setError(err.message ?? 'Could not load your dashboard.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleHabit = async (habit) => {
    const wasDone = habit.done_today;
    setHabits((hs) => hs.map((h) => (h.id === habit.id ? { ...h, done_today: !wasDone } : h)));
    try {
      const res = wasDone ? await habitsApi.uncheckin(habit.id) : await habitsApi.checkin(habit.id);
      setHabits((hs) => hs.map((h) => (h.id === habit.id ? { ...h, done_today: !wasDone, current_streak: res.streak } : h)));
    } catch {
      setHabits((hs) => hs.map((h) => (h.id === habit.id ? { ...h, done_today: wasDone } : h)));
    }
  };

  if (loading) {
    return <PageWrapper><Card><div className="grid place-items-center py-24"><LoadingSpinner /></div></Card></PageWrapper>;
  }
  if (error) {
    return (
      <PageWrapper>
        <Card className="border-danger/40">
          <p className="text-sm text-text-primary">Couldn't load your dashboard</p>
          <p className="text-xs text-text-secondary mt-1">{error}</p>
          <button onClick={() => load()} className="mt-3 text-sm text-nexus-primary hover:underline">Retry</button>
        </Card>
      </PageWrapper>
    );
  }

  const briefing = data?.briefing;
  const stats = data?.stats ?? {};
  const events = data?.events ?? [];

  return (
    <PageWrapper>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 auto-rows-min">

        {/* Briefing hero */}
        <Card className="lg:col-span-8 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-nexus-primary via-nexus-secondary to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-text-primary">{briefing?.greeting}</h1>
              <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">{briefing?.headline}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {data?.generated && <Badge intent="primary">AI</Badge>}
              <button onClick={() => load({ refresh: true })} disabled={refreshing}
                className="w-8 h-8 grid place-items-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors" aria-label="Refresh briefing">
                {refreshing ? <LoadingSpinner /> : <RefreshCw size={15} />}
              </button>
            </div>
          </div>

          {briefing?.priorities?.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">Today's focus</p>
              <ol className="space-y-3">
                {briefing.priorities.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-nexus-primary/12 text-nexus-primary border border-nexus-primary/25 grid place-items-center text-xs font-semibold tabular-nums">{i + 1}</span>
                    <span className="pt-0.5"><span className="text-sm text-text-primary font-medium">{p.title}</span>{p.reason && <span className="text-sm text-text-secondary"> — {p.reason}</span>}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {briefing?.nudge && <p className="mt-6 text-sm text-text-secondary border-l-2 border-nexus-primary/60 pl-3">{briefing.nudge}</p>}

          <Link to="/chat" className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-nexus-primary text-on-accent font-semibold text-sm px-4 py-2.5 hover:bg-nexus-primary-hover transition-colors">
            Plan in chat <ArrowUpRight size={16} />
          </Link>
        </Card>

        {/* Right rail: quick jump + stats */}
        <div className="lg:col-span-4 grid grid-cols-1 gap-4 auto-rows-min">
          <Card>
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">Jump back in</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="group flex items-center gap-2.5 rounded-xl border border-surface-border bg-surface-3/40 px-3 py-2.5 hover:border-nexus-primary/40 hover:bg-surface-3 transition-all">
                  <Icon size={16} className="text-nexus-primary" />
                  <span className="text-sm text-text-secondary group-hover:text-text-primary">{label}</span>
                </Link>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {STAT_TILES.map((t) => (
              <Link key={t.key} to={t.to}>
                <Card padded={false} className="py-4 text-center hover:border-nexus-primary/40 transition-colors">
                  <div className={`text-2xl font-display font-bold tabular-nums ${t.accent}`}>{stats[t.key] ?? 0}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{t.label}</div>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Today's habits */}
        <Card className="lg:col-span-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-text-primary">Today's habits</h2>
            <Link to="/habits" className="text-xs text-nexus-primary hover:underline">All →</Link>
          </div>
          {habits.length === 0 ? (
            <p className="text-sm text-text-secondary">No habits yet. <Link to="/habits" className="text-nexus-primary hover:underline">Add one</Link>.</p>
          ) : (
            <ul className="space-y-1">
              {habits.slice(0, 5).map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-1.5">
                  <button onClick={() => toggleHabit(h)}
                    className={`shrink-0 w-6 h-6 rounded-full border grid place-items-center transition-colors ${h.done_today ? 'bg-nexus-primary border-nexus-primary text-on-accent' : 'border-surface-border text-text-muted hover:border-nexus-primary/60'}`}
                    aria-label={h.done_today ? `Undo ${h.name}` : `Complete ${h.name}`}>
                    {h.done_today ? <Check size={13} strokeWidth={3} /> : null}
                  </button>
                  <span className={`flex-1 text-sm ${h.done_today ? 'text-text-muted line-through' : 'text-text-primary'}`}>{h.name}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-text-secondary tabular-nums"><Flame size={13} className={h.current_streak > 0 ? 'text-warning' : 'text-text-muted'} /> {h.current_streak ?? 0}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Today's schedule */}
        <Card className="lg:col-span-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-text-primary">Today's schedule</h2>
            <Link to="/calendar" className="text-xs text-nexus-primary hover:underline">Calendar →</Link>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-text-secondary">Nothing scheduled today. <Link to="/calendar" className="text-nexus-primary hover:underline">Connect Google Calendar</Link> to see your events.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {events.map((e) => (
                <li key={e.google_event_id} className="flex gap-3 py-2">
                  <span className="shrink-0 w-20 text-xs font-mono text-text-secondary pt-0.5">{eventTime(e)}</span>
                  <span className="min-w-0">
                    <span className="text-sm text-text-primary block truncate">{e.title}</span>
                    {e.location && <span className="text-xs text-text-muted truncate flex items-center gap-1"><MapPin size={11} /> {e.location}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </motion.div>
    </PageWrapper>
  );
}
