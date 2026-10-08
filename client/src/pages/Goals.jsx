// Goals + milestones. Progress derives from milestone completion. Real (Phase 3).
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Plus } from 'lucide-react';
import { goalsApi } from '../lib/api.js';
import { useGoalsStore } from '../store/useGoalsStore.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';
import { formatDate } from '../lib/utils.js';

const CATEGORY_INTENT = { academic: 'info', health: 'success', career: 'primary', personal: 'neutral' };

function ProgressBar({ pct }) {
  return (
    <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-nexus-primary to-nexus-secondary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
      />
    </div>
  );
}

function GoalCard({ goal, onToggleMilestone, onAddMilestone, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const milestones = goal.milestones ?? [];

  const submitMilestone = async () => {
    if (!msTitle.trim()) return;
    await onAddMilestone(goal, msTitle.trim());
    setMsTitle('');
    setAdding(false);
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-text-primary truncate">{goal.title}</h3>
            <Badge intent={CATEGORY_INTENT[goal.category] ?? 'neutral'} className="capitalize">
              {goal.category}
            </Badge>
          </div>
          {goal.description && <p className="text-sm text-text-secondary mt-0.5">{goal.description}</p>}
          {goal.target_date && (
            <p className="text-xs text-text-muted mt-0.5">Target: {formatDate(goal.target_date, 'MMM d, yyyy')}</p>
          )}
        </div>
        <button
          onClick={() => onDelete(goal)}
          className="text-text-muted hover:text-danger transition-colors shrink-0"
          aria-label="Delete goal"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-text-secondary tabular-nums w-9">{goal.progress_pct ?? 0}%</span>
        <div className="flex-1">
          <ProgressBar pct={goal.progress_pct} />
        </div>
      </div>

      {milestones.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <button
                onClick={() => onToggleMilestone(goal, m)}
                className={[
                  'shrink-0 w-5 h-5 rounded border grid place-items-center transition-colors',
                  m.completed
                    ? 'bg-success border-success text-white'
                    : 'border-surface-border text-text-muted hover:border-nexus-primary/60'
                ].join(' ')}
                aria-label={m.completed ? `Uncomplete ${m.title}` : `Complete ${m.title}`}
              >
                {m.completed ? <Check size={12} strokeWidth={3} /> : null}
              </button>
              <span
                className={['text-sm', m.completed ? 'text-text-muted line-through' : 'text-text-primary'].join(' ')}
              >
                {m.title}
              </span>
              {m.due_date && <span className="text-xs text-text-muted ml-auto">{formatDate(m.due_date, 'MMM d')}</span>}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 flex gap-2">
          <Input
            value={msTitle}
            onChange={(e) => setMsTitle(e.target.value)}
            placeholder="Milestone…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitMilestone();
              if (e.key === 'Escape') setAdding(false);
            }}
            autoFocus
          />
          <Button size="sm" onClick={submitMilestone} disabled={!msTitle.trim()}>
            Add
          </Button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 text-xs text-nexus-primary hover:underline">
          + Add milestone
        </button>
      )}
    </Card>
  );
}

export default function Goals() {
  const { goals, setGoals, upsertGoal, removeGoal, setMilestones, loading, setLoading } = useGoalsStore();
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'personal', target_date: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { goals: list } = await goalsApi.list();
      setGoals(list ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [setGoals, setLoading]);

  useEffect(() => {
    load();
  }, [load]);

  const createGoal = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const { goal } = await goalsApi.create({
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        target_date: form.target_date || null
      });
      upsertGoal(goal);
      setForm({ title: '', description: '', category: 'personal', target_date: '' });
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteGoal = async (goal) => {
    removeGoal(goal.id);
    try {
      await goalsApi.remove(goal.id);
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  const toggleMilestone = async (goal, m) => {
    const next = (goal.milestones ?? []).map((x) => (x.id === m.id ? { ...x, completed: !m.completed } : x));
    setMilestones(goal.id, next);
    try {
      await goalsApi.updateMilestone(goal.id, m.id, { completed: !m.completed });
      const { goals: list } = await goalsApi.list(); // refresh progress
      setGoals(list ?? []);
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  const addMilestone = async (goal, title) => {
    try {
      const { milestone } = await goalsApi.addMilestone(goal.id, { title });
      setMilestones(goal.id, [...(goal.milestones ?? []), milestone]);
      const { goals: list } = await goalsApi.list();
      setGoals(list ?? []);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Goals</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={15} /> New goal
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <Badge intent="danger">{error}</Badge>
        </div>
      )}

      {loading ? (
        <Card>
          <div className="grid place-items-center py-12">
            <LoadingSpinner />
          </div>
        </Card>
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon="◬"
            title="No goals yet"
            description="Set a long-running goal and break it into milestones. Progress tracks itself."
            action={
              <Button size="sm" onClick={() => setModalOpen(true)}>
                Create your first goal
              </Button>
            }
          />
        </Card>
      ) : (
        <motion.div
          className="grid gap-4 md:grid-cols-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onToggleMilestone={toggleMilestone}
              onAddMilestone={addMilestone}
              onDelete={deleteGoal}
            />
          ))}
        </motion.div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New goal"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={createGoal} disabled={saving || !form.title.trim()}>
              {saving ? 'Saving…' : 'Create goal'}
            </Button>
          </>
        }
      >
        <label className="block text-sm text-text-secondary mb-1">Title</label>
        <Input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Ship Nexus v1"
          autoFocus
        />
        <label className="block text-sm text-text-secondary mt-3 mb-1">Description</label>
        <Input
          as="textarea"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Optional"
        />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Category</label>
            <Input
              as="select"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="personal">Personal</option>
              <option value="academic">Academic</option>
              <option value="health">Health</option>
              <option value="career">Career</option>
            </Input>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Target date</label>
            <Input
              type="date"
              value={form.target_date}
              onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </PageWrapper>
  );
}
