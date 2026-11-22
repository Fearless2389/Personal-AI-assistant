// One browser task: status, goal, its latest steps, and whatever it needs from Ruthvik right now
// (a ConfirmCard for a risky step, or a reply box for its question). When it ends, its summary.
//   ┌ ◉ Browser · Working  step 7 · amazon.in                       [Stop] ┐
//   │ Find a 65W USB-C charger under ₹1500 on Amazon, add to cart          │
//   │ ✓ 6  Opened "Anker 65W GaN…"                               amazon.in │
//   │ ⏳ ConfirmCard / reply box                                           │
//   └──────────────────────────────────────────────────────────────────────┘
// Chat shows it pinned above the composer; the AgentStrip's "View" opens it in a modal.
import { useEffect, useState } from 'react';
import { Globe, X } from 'lucide-react';
import { useBrowserStore, LIVE, FINAL } from '../../store/useBrowserStore.js';
import { useConfirmStore } from '../../store/useConfirmStore.js';
import { browserCardFor } from '../../lib/confirmations.js';
import { loadSteps, stopTask } from '../../lib/browserTasks.js';
import { ConfirmCard } from '../shared/ConfirmCard.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { StepFeed } from './StepFeed.jsx';
import { hostOf, taskStatusMeta } from '../../lib/browserFormat.js';
import { QuestionReply } from './QuestionReply.jsx';
import { StepShot } from './StepShot.jsx';
import { cn } from '../../lib/utils.js';

export function TaskCard({ taskId, onDismiss, hint = 'or type "yes"' }) {
  const task = useBrowserStore((s) => s.tasks[taskId]);
  const steps = useBrowserStore((s) => s.steps[taskId]);
  const cardId = useConfirmStore((s) => browserCardFor(s.confirmations, taskId));
  const cardShot = useConfirmStore((s) => (cardId ? s.confirmations[cardId]?.shot : null));
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (task && (steps?.length ?? 0) < task.steps_used) loadSteps(taskId);
  }, [task, steps, taskId]);

  if (!task) return null;
  const live = LIVE.has(task.status);
  const meta = taskStatusMeta(task);
  const site = hostOf(task.start_url ?? steps?.at(-1)?.url);
  const needsYou = task.status === 'waiting_user' || cardId;

  const stop = async () => {
    setStopping(true);
    setError(null);
    try {
      await stopTask(taskId);
    } catch (err) {
      setError(err.message || 'Could not stop it.');
    } finally {
      setStopping(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 text-sm space-y-2',
        needsYou ? 'border-warning/40 bg-warning/[0.04]' : 'border-surface-border bg-surface-2/60'
      )}
    >
      <div className="flex items-center gap-2">
        <Globe size={14} className={cn('shrink-0', live ? 'text-nexus-primary' : 'text-text-muted')} />
        <span className="text-xs text-text-muted">Browser</span>
        <Badge intent={meta.intent}>{meta.label}</Badge>
        <span className="flex-1 min-w-0 truncate text-xs text-text-muted">
          {task.steps_used > 0 && `step ${task.steps_used}`}
          {task.steps_used > 0 && site && ' · '}
          {site}
        </span>
        {live && (
          <Button size="sm" variant="ghost" onClick={stop} disabled={stopping}>
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        )}
        {!live && onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss" className="p-1 text-text-muted hover:text-text-secondary">
            <X size={14} />
          </button>
        )}
      </div>
      <p className="text-text-primary break-words">{task.goal}</p>
      <StepFeed steps={steps} />
      {cardId && (
        <ConfirmCard
          id={cardId}
          hint={hint}
          media={cardShot && <StepShot taskId={taskId} name={cardShot} label="The page it's about to act on" />}
        />
      )}
      {task.status === 'waiting_user' && task.question && (
        <div className="space-y-1.5">
          <p className="text-text-primary">{task.question}</p>
          <QuestionReply taskId={taskId} question={task.question} />
        </div>
      )}
      {!live && task.summary && <p className="text-text-secondary break-words">{task.summary}</p>}
      {FINAL.has(task.status) && <StepShot taskId={taskId} name="final" label="Last page" />}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export default TaskCard;
