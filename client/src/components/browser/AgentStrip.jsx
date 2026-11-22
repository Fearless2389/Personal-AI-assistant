// "The browser agent needs you", on every page, under the top bar:
//   question:  ◉ Browser agent · amazon.in asks: …   [ answer… ] [Send] [Continue as guest] [Stop]
//   confirm:   ◉ ConfirmCard ("On amazon.in: Click Add to Cart")                   [Stop task]
//   finished:  ✓ Done: Added "Spigen case" to cart · 5 steps        [View]   (fades after 8 s)
// Hidden on Chat, which pins the full TaskCard above the composer instead (no duplicate).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Globe, X } from 'lucide-react';
import { useBrowserStore, selectLive } from '../../store/useBrowserStore.js';
import { useConfirmStore } from '../../store/useConfirmStore.js';
import { browserCardFor } from '../../lib/confirmations.js';
import { stopTask, dismissNotice } from '../../lib/browserTasks.js';
import { ConfirmCard } from '../shared/ConfirmCard.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Modal } from '../ui/Modal.jsx';
import { QuestionReply } from './QuestionReply.jsx';
import { StepShot } from './StepShot.jsx';
import { TaskCard } from './TaskCard.jsx';
import { hostOf, taskStatusMeta } from '../../lib/browserFormat.js';
import { cn } from '../../lib/utils.js';

const NOTICE_MS = 8_000;

function StopButton({ taskId, label = 'Stop' }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await stopTask(taskId).catch((err) => console.warn('[browser] stop failed:', err.message));
        setBusy(false);
      }}
    >
      {busy ? 'Stopping…' : label}
    </Button>
  );
}

// A finished task's one-liner. Fades after 8 s; hovering keeps it.
function Notice({ task, onView }) {
  const timer = useRef(null);
  const arm = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(dismissNotice, NOTICE_MS);
  };
  useEffect(() => {
    timer.current = setTimeout(dismissNotice, NOTICE_MS);
    return () => clearTimeout(timer.current);
  }, [task.id]);
  const meta = taskStatusMeta(task);

  return (
    <div
      className="flex items-center gap-2 text-sm"
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={arm}
      role="status"
    >
      <Globe size={14} className="shrink-0 text-text-muted" />
      <Badge intent={meta.intent} className="shrink-0">
        {meta.label}
      </Badge>
      <p className="flex-1 min-w-0 truncate text-text-secondary" title={task.summary ?? task.goal}>
        {task.summary ?? task.goal}
        {task.steps_used > 0 && <span className="text-text-muted"> · {task.steps_used} steps</span>}
      </p>
      <Button size="sm" variant="outline" onClick={onView}>
        View
      </Button>
      <button onClick={dismissNotice} aria-label="Dismiss" className="p-1 text-text-muted hover:text-text-secondary">
        <X size={14} />
      </button>
    </div>
  );
}

export function AgentStrip() {
  const { pathname } = useLocation();
  const live = useBrowserStore(selectLive);
  const notice = useBrowserStore((s) => (s.notice ? s.tasks[s.notice] : null));
  const cardId = useConfirmStore((s) => (live ? browserCardFor(s.confirmations, live.id) : null));
  const cardShot = useConfirmStore((s) => (cardId ? s.confirmations[cardId]?.shot : null));
  const [viewing, setViewing] = useState(null);
  const [expanded, setExpanded] = useState(false); // a long question: tap to read all of it

  // Portalled: the strip sits in the blurred sticky header, which would trap a fixed modal inside it.
  const modal = createPortal(
    <Modal open={!!viewing} onClose={() => setViewing(null)} title="Browser task" size="lg">
      {viewing && <TaskCard taskId={viewing} hint='or say "yes"' />}
    </Modal>,
    document.body
  );
  if (pathname === '/chat') return modal;

  let body = null;
  let urgent = true; // a question or a confirm: tinted; a notice: plain
  if (live?.status === 'waiting_user' && live.question) {
    const site = hostOf(live.start_url);
    body = (
      <div className="space-y-1.5">
        <div className="flex items-start gap-2 text-sm">
          <Globe size={14} className="mt-0.5 shrink-0 text-warning" />
          <p
            className={cn('flex-1 min-w-0 text-text-primary break-words cursor-pointer', !expanded && 'line-clamp-3')}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title={expanded ? undefined : 'Show the whole question'}
          >
            <span className="text-text-muted">Browser agent{site && ` · ${site}`} asks: </span>
            {live.question}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2 pl-6">
          <div className="flex-1 min-w-[16rem]">
            <QuestionReply taskId={live.id} question={live.question} />
          </div>
          <StopButton taskId={live.id} />
        </div>
      </div>
    );
  } else if (cardId) {
    body = (
      <ConfirmCard
        id={cardId}
        hint='or say "yes"'
        extra={<StopButton taskId={live.id} label="Stop task" />}
        media={cardShot && <StepShot taskId={live.id} name={cardShot} label="The page it's about to act on" />}
      />
    );
  } else if (notice) {
    urgent = false;
    body = (
      <Notice
        task={notice}
        onView={() => {
          setViewing(notice.id);
          dismissNotice();
        }}
      />
    );
  }

  return (
    <>
      {body && (
        <div className={cn('border-t border-surface-border px-4 md:px-6 py-2', urgent && 'bg-warning/[0.05]')}>
          {body}
        </div>
      )}
      {modal}
    </>
  );
}

export default AgentStrip;
