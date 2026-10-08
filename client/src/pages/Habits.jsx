// Habits — daily check-ins with streaks. Real (Phase 3).
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Check, X, Plus, Trophy } from 'lucide-react';
import { habitsApi } from '../lib/api.js';
import { useHabitsStore } from '../store/useHabitsStore.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';

function StatTile({ label, value, sub }) {
  return (
    <Card padded={false} className="px-5 py-4">
      <div className="text-2xl font-display font-bold text-text-primary tabular-nums">{value}</div>
      <div className="text-xs text-text-secondary mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </Card>
  );
}

function HabitCard({ habit, onToggle, onDelete, busy }) {
  const done = habit.done_today;
  return (
    <Card className="flex flex-col gap-4 group">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(habit)}
          disabled={busy}
          aria-pressed={done}
          aria-label={done ? `Mark ${habit.name} not done` : `Mark ${habit.name} done`}
          className={[
            'shrink-0 w-10 h-10 rounded-full border grid place-items-center transition-all',
            done
              ? 'bg-nexus-primary border-nexus-primary text-on-accent signal-glow'
              : 'border-surface-border text-text-muted hover:border-nexus-primary/60 hover:text-nexus-primary'
          ].join(' ')}
        >
          {done ? <Check size={18} strokeWidth={3} /> : <span className="w-2.5 h-2.5 rounded-full bg-current opacity-40" />}
        </button>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className={['font-medium truncate', done ? 'text-text-secondary line-through' : 'text-text-primary'].join(' ')}>{habit.name}</p>
          <p className="text-xs text-text-muted capitalize">{habit.frequency}</p>
        </div>
        <button onClick={() => onDelete(habit)} aria-label={`Delete ${habit.name}`}
          className="text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-4 pt-3 border-t border-surface-border">
        <div className="flex items-center gap-1.5">
          <Flame size={18} className={habit.current_streak > 0 ? 'text-warning' : 'text-text-muted'} />
          <span className="font-display text-lg font-bold text-text-primary tabular-nums">{habit.current_streak ?? 0}</span>
          <span className="text-xs text-text-secondary">day streak</span>
        </div>
        {habit.longest_streak > 0 && (
          <div className="flex items-center gap-1 text-xs text-text-muted ml-auto">
            <Trophy size={13} /> best {habit.longest_streak}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Habits() {
  const { habits, setHabits, upsert, remove, loading, setLoading } = useHabitsStore();
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFreq, setNewFreq] = useState('daily');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { habits: list } = await habitsApi.list();
      setHabits(list ?? []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [setHabits, setLoading]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (habit) => {
    setBusyId(habit.id);
    const wasDone = habit.done_today;
    upsert({ id: habit.id, done_today: !wasDone });
    try {
      const res = wasDone ? await habitsApi.uncheckin(habit.id) : await habitsApi.checkin(habit.id);
      upsert({ id: habit.id, done_today: !wasDone, current_streak: res.streak, longest_streak: res.longest });
    } catch (err) {
      upsert({ id: habit.id, done_today: wasDone });
      setError(err.message);
    } finally { setBusyId(null); }
  };

  const del = async (habit) => {
    remove(habit.id);
    try { await habitsApi.remove(habit.id); }
    catch (err) { setError(err.message); load(); }
  };

  const create = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { habit } = await habitsApi.create({ name: newName.trim(), frequency: newFreq });
      upsert(habit);
      setNewName(''); setNewFreq('daily'); setModalOpen(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const doneCount = habits.filter((h) => h.done_today).length;
  const best = habits.reduce((m, h) => Math.max(m, h.longest_streak ?? 0), 0);

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-text-primary">Habits</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}><Plus size={15} /> New habit</Button>
      </div>

      {error && <div className="mb-4"><Badge intent="danger">{error}</Badge></div>}

      {loading ? (
        <Card><div className="grid place-items-center py-16"><LoadingSpinner /></div></Card>
      ) : habits.length === 0 ? (
        <Card>
          <EmptyState icon="◯" title="No habits yet"
            description="Add a daily habit and build a streak. Nexus can check them in from chat too."
            action={<Button size="sm" onClick={() => setModalOpen(true)}>Create your first habit</Button>} />
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Done today" value={`${doneCount}/${habits.length}`} />
            <StatTile label="Active habits" value={habits.length} />
            <StatTile label="Best streak" value={best} sub={best ? 'days' : ''} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {habits.map((h) => (
              <HabitCard key={h.id} habit={h} onToggle={toggle} onDelete={del} busy={busyId === h.id} />
            ))}
          </div>
        </motion.div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New habit"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={create} disabled={saving || !newName.trim()}>{saving ? 'Saving…' : 'Add habit'}</Button>
        </>}>
        <label className="block text-sm text-text-secondary mb-1">Habit name</label>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Read 20 minutes"
          onKeyDown={(e) => { if (e.key === 'Enter') create(); }} autoFocus />
        <label className="block text-sm text-text-secondary mt-3 mb-1">Frequency</label>
        <Input as="select" value={newFreq} onChange={(e) => setNewFreq(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </Input>
      </Modal>
    </PageWrapper>
  );
}
