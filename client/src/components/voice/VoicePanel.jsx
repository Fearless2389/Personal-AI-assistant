// Live transcript of the voice session: what you said, what Nexus did (action
// chips, same as ⌘K), and what it said back.
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceStore } from '../../store/useVoiceStore.js';
import { clearTranscript, shutdown, stopAll } from '../../lib/voice/engine.js';
import { isWaiting } from '../../lib/voice/confirmations.js';
import { ActionChip } from '../shared/ActionChip.jsx';
import { ConfirmCard } from './ConfirmCard.jsx';
import { cn } from '../../lib/utils.js';

const LABEL = {
  off: 'Voice is off',
  connecting: 'Connecting…',
  ready: 'Ready. Hold to talk',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking. Press to interrupt',
  error: 'Voice hit a problem'
};

// resolve_pending_action only updates a confirmation card, so it gets no chip of
// its own (the card already shows the outcome).
const visibleActions = (actions) => actions.filter((a) => a.name !== 'resolve_pending_action');

const DOT = {
  off: 'bg-text-muted',
  connecting: 'bg-warning',
  ready: 'bg-nexus-primary',
  listening: 'bg-danger animate-pulse',
  thinking: 'bg-nexus-primary animate-pulse',
  speaking: 'bg-nexus-primary',
  error: 'bg-danger'
};

export function VoicePanel({ onClose }) {
  const status = useVoiceStore((s) => s.status);
  const error = useVoiceStore((s) => s.error);
  const turns = useVoiceStore((s) => s.turns);
  const anyWaiting = useVoiceStore((s) => Object.values(s.confirmations).some(isWaiting));
  const navigate = useNavigate();
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const go = (to) => {
    onClose();
    navigate(to);
  };
  const busy = ['listening', 'thinking', 'speaking'].includes(status);

  return (
    // Phones: pinned to the viewport (the orb sits mid-header, so an anchored panel
    // would run off the left edge). sm+: anchored under the orb.
    <div className="fixed inset-x-4 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[22rem] rounded-xl bg-surface-2 border border-surface-border shadow-xl overflow-hidden z-40">
      <div className="px-3 py-2.5 border-b border-surface-border flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full shrink-0', DOT[status])} />
        <p className="text-sm text-text-primary flex-1" aria-live="polite">
          {LABEL[status]}
        </p>
        <kbd className="hidden sm:inline font-mono text-[10px] text-text-muted border border-surface-border rounded px-1 py-px">
          Ctrl Alt Space
        </kbd>
      </div>

      {error && (
        <p className="mx-3 mt-3 rounded-lg border border-danger/30 bg-danger/[0.07] px-2.5 py-2 text-sm text-text-primary">
          {error}
        </p>
      )}

      <div ref={listRef} className="max-h-[55vh] overflow-y-auto px-3 py-3 space-y-4">
        {turns.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Hold the mic (or Ctrl+Alt+Space) and talk. Try &ldquo;what&rsquo;s due this week?&rdquo; or &ldquo;got the
            Amazon OA, due Sunday 9 PM&rdquo;.
          </p>
        ) : (
          turns.map((t) => {
            const shown = visibleActions(t.actions);
            return (
              <div key={t.id} className="space-y-1.5">
                <p className="text-sm">
                  <span className="text-text-muted">You · </span>
                  {t.cue && !t.heard.trim() ? (
                    <span className="text-text-muted italic">{t.cue}</span>
                  ) : (
                    <span className="text-text-primary">{t.heard.trim() || '…'}</span>
                  )}
                </p>
                {shown.length > 0 && (
                  <ul className="space-y-1.5">
                    {shown.map((a, i) => (
                      <li key={i}>
                        {a.result?.needs_confirmation ? (
                          <ConfirmCard id={a.result.confirmation_id} />
                        ) : (
                          <ActionChip action={a} onNavigate={go} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {t.said.trim() && (
                  <p className="text-sm">
                    <span className="text-nexus-primary">Nexus · </span>
                    <span className="text-text-secondary">{t.said.trim()}</span>
                    {t.interrupted && <span className="text-text-muted"> (interrupted)</span>}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-3 py-2 border-t border-surface-border flex justify-end gap-2">
        {(busy || anyWaiting) && status !== 'listening' && (
          <button
            onClick={stopAll}
            title="Stop talking and cancel anything waiting for your OK (Esc)"
            className="text-xs text-text-secondary hover:text-danger px-2 py-1 mr-auto"
          >
            Stop <kbd className="hidden sm:inline font-mono text-[10px] text-text-muted">Esc</kbd>
          </button>
        )}
        {turns.length > 0 && !busy && (
          <button onClick={clearTranscript} className="text-xs text-text-muted hover:text-text-secondary px-2 py-1">
            Clear
          </button>
        )}
        {status !== 'off' && (
          <button
            onClick={() => {
              shutdown();
              onClose();
            }}
            className="text-xs text-text-muted hover:text-danger px-2 py-1"
          >
            End voice
          </button>
        )}
      </div>
    </div>
  );
}

export default VoicePanel;
