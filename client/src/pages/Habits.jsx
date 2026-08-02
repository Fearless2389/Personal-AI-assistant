// Habits — daily check-ins with streaks. Real (Phase 3).
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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

function HabitRow({ habit, onToggle, onDelete, busy }) {
  const done = habit.done_today;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-surface-border last:border-b-0">
      <button
        onClick={() => onToggle(habit)}
        disabled={busy}
        aria-pressed={done}
        aria-label={done ? `Mark ${habit.name} not done` : `Mark ${habit.name} done`}
        className={[
          'shrink-0 w-8 h-8 rounded-full border grid place-items-center transition-colors',
          done
            ? 'bg-nexus-primary border-nexus-primary text-white'
            : 'border-surface-border text-text-muted hover:border-nexus-primary/60'
        ].join(' ')}
      >
        {done ? '✓' : ''}
      </button>
      <div className="flex-1 min-w-0">
        <p className={['text-sm font-medium truncate', done ? 'text-text-secondary line-through' : 'text-text-primary'].join(' ')}>
          {habit.name}
        </p>
        <p className="text-xs text-text-muted capitalize">{habit.frequency}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm text-text-secondary tabular-nums" title="Current streak">
          🔥 {habit.current_streak ?? 0}
        </span>
        {habit.longest_streak > 0 && (
          <Badge intent="neutral" title="Longest streak">best {habit.longest_streak}</Badge>
        )}
        <button
          onClick={() => onDelete(habit)}
          className="text-text-muted hover:text-danger text-sm"
          aria-label={`Delete ${habit.name}`}
        >
          ✕
        </button>
      </div>
    </div>
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [setHabits, setLoading]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (habit) => {
    setBusyId(habit.id);
    const wasDone = habit.done_today;
    // optimistic
    upsert({ id: habit.id, done_today: !wasDone });
    try {
      const res = wasDone ? await habitsApi.uncheckin(habit.id) : await habitsApi.checkin(habit.id);
      upsert({ id: habit.id, done_today: !wasDone, current_streak: res.streak, longest_streak: res.longest });
    } catch (err) {
      upsert({ id: habit.id, done_today: wasDone }); // rollback
      setError(err.message);
    } finally {
      setBusyId(null);
    }
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
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const doneCount = habits.filter(h => h.done_today).length;

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Habits</h1>
          {habits.length > 0 && (
            <p className="text-sm text-text-secondary mt-0.5">{doneCount} of {habits.length} done today</p>
          )}
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>+ New habit</Button>
      </div>

      {error && (
        <div className="mb-4"><Badge intent="danger">{error}</Badge></div>
      )}

      {loading ? (
        <Card><div className="grid place-items-center py-12"><LoadingSpinner /></div></Card>
      ) : habits.length === 0 ? (
        <Card>
          <EmptyState
            icon="◯"
            title="No habits yet"
            description="Add a daily habit and build a streak. Nexus can check them in from chat too."
            action={<Button size="sm" onClick={() => setModalOpen(true)}>Create your first habit</Button>}
          />
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card>
            {habits.map(h => (
              <HabitRow key={h.id} habit={h} onToggle={toggle} onDelete={del} busy={busyId === h.id} />
            ))}
          </Card>
        </motion.div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New habit"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={saving || !newName.trim()}>
              {saving ? 'Saving…' : 'Add habit'}
            </Button>
          </>
        }
      >
        <label className="block text-sm text-text-secondary mb-1">Habit name</label>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Read 20 minutes"
          onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          autoFocus
        />
        <label className="block text-sm text-text-secondary mt-3 mb-1">Frequency</label>
        <Input as="select" value={newFreq} onChange={(e) => setNewFreq(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </Input>
      </Modal>
    </PageWrapper>
  );
}
