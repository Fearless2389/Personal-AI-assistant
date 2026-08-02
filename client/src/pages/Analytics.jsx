// Analytics — last-7-day activity. Lightweight SVG/CSS bars in the app's own
// token palette (tasks=primary, focus=secondary, habits=success). Real (Phase 4).
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { analyticsApi } from '../lib/api.js';
import { Card } from '../components/ui/Card.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';

function StatTile({ label, value, suffix }) {
  return (
    <Card className="py-4">
      <div className="text-2xl font-display font-semibold text-text-primary tabular-nums">
        {value}{suffix && <span className="text-sm text-text-secondary ml-1">{suffix}</span>}
      </div>
      <div className="text-xs text-text-secondary mt-0.5">{label}</div>
    </Card>
  );
}

// A 7-column bar chart. `color` is a CSS var string; values labelled + aria-described.
function BarChart({ title, days, pick, color, unit }) {
  const max = Math.max(1, ...days.map(pick));
  return (
    <Card>
      <h3 className="font-display text-base font-semibold text-text-primary mb-4">{title}</h3>
      <div className="flex items-end justify-between gap-2 h-40" role="img" aria-label={title}>
        {days.map((d) => {
          const v = pick(d);
          const h = Math.round((v / max) * 100);
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <span className="text-[10px] text-text-muted tabular-nums h-3">{v > 0 ? v : ''}</span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-t-md transition-all duration-300"
                  style={{ height: `${h}%`, minHeight: v > 0 ? 4 : 0, background: color }}
                  title={`${format(parseISO(d.date), 'EEE MMM d')}: ${v} ${unit}`}
                />
              </div>
              <span className="text-[10px] text-text-muted">{format(parseISO(d.date), 'EEE')}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StatusBar({ split }) {
  const total = (split.todo ?? 0) + (split.in_progress ?? 0) + (split.done ?? 0);
  if (!total) return null;
  const seg = [
    { key: 'done', label: 'Done', value: split.done, color: 'var(--color-success)' },
    { key: 'in_progress', label: 'In progress', value: split.in_progress, color: 'var(--color-nexus-primary)' },
    { key: 'todo', label: 'To-do', value: split.todo, color: 'var(--color-surface-3)' }
  ];
  return (
    <Card>
      <h3 className="font-display text-base font-semibold text-text-primary mb-3">Task status</h3>
      <div className="flex h-3 rounded-full overflow-hidden">
        {seg.map(s => s.value > 0 && (
          <div key={s.key} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-text-secondary">
        {seg.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="text-text-muted tabular-nums">{s.value}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try { setData(await analyticsApi.get()); }
      catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <PageWrapper><Card><div className="grid place-items-center py-16"><LoadingSpinner /></div></Card></PageWrapper>;
  }
  if (error) {
    return <PageWrapper><Card><EmptyState icon="◫" title="Couldn't load analytics" description={error} /></Card></PageWrapper>;
  }

  const { days, totals, statusSplit } = data;

  return (
    <PageWrapper>
      <h1 className="font-display text-2xl font-semibold text-text-primary mb-5">Analytics</h1>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Tasks done (7d)" value={totals.tasksDoneWeek} />
          <StatTile label="Focus this week" value={totals.focusMinutesWeek} suffix="min" />
          <StatTile label="Open tasks" value={totals.tasksOpen} />
          <StatTile label="Notes" value={totals.notes} />
        </div>

        <StatusBar split={statusSplit} />

        <div className="grid gap-4 md:grid-cols-2">
          <BarChart title="Tasks completed" days={days} pick={(d) => d.tasksCompleted} color="var(--color-nexus-primary)" unit="tasks" />
          <BarChart title="Focus minutes" days={days} pick={(d) => d.focusMinutes} color="var(--color-nexus-secondary)" unit="min" />
        </div>
        <BarChart title="Habit check-ins" days={days} pick={(d) => d.habitCheckins} color="var(--color-success)" unit="check-ins" />
      </motion.div>
    </PageWrapper>
  );
}
