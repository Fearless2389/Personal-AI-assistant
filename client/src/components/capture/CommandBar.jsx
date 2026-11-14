// ⌘K capture bar — "tell Nexus anything" from any page. Each capture is a one-shot
// chat turn in its own session; the tools Nexus runs come back as confirmation
// chips, and the pages they affect are told to refresh.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Sparkles, CornerDownLeft } from 'lucide-react';
import { streamChat } from '../../lib/api.js';
import { ActionItem } from '../shared/ActionItem.jsx';
import { applyToolResult, isShownAction } from '../../lib/confirmations.js';
import { cn } from '../../lib/utils.js';
import { useCommandBar } from '../../store/useCommandBar.js';
import { VoiceButton } from '../shared/VoiceButton.jsx';

const HINTS = [
  'Applied to Uber new-grad, OA Friday 6pm',
  'Comp Fin assignment due Monday 11:59pm',
  "What's due this week?"
];

function newCaptureId() {
  return `capture-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

export function CommandBar() {
  const { open, seed, hide, toggle } = useCommandBar();

  // Global shortcut: Ctrl/⌘+K toggles from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // The panel mounts fresh on every open, so each capture starts clean.
  return <AnimatePresence>{open && <CapturePanel seed={seed} hide={hide} />}</AnimatePresence>;
}

function CapturePanel({ seed, hide }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const ctrlRef = useRef(null);
  const [text, setText] = useState(seed || '');
  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [actions, setActions] = useState([]);
  const [reply, setReply] = useState('');
  const [error, setError] = useState(null);

  // Focus on open; abort any in-flight capture when the panel closes.
  useEffect(() => {
    inputRef.current?.focus();
    return () => ctrlRef.current?.abort();
  }, []);

  const submit = async () => {
    const message = text.trim();
    if (!message || phase === 'running') return;
    setPhase('running');
    setActions([]);
    setReply('');
    setError(null);
    let failed = false;

    const ctrl = streamChat({
      message,
      sessionId: newCaptureId(),
      onChunk: (evt) => {
        if (evt.type === 'text') setReply((r) => r + (evt.delta ?? ''));
        else if (evt.type === 'tool_result') {
          setActions((list) => [...list, { name: evt.name, args: evt.args, result: evt.result }]);
          applyToolResult(evt.name, evt.result);
        } else if (evt.type === 'error') {
          failed = true;
          setError(evt.message);
        }
      }
    });
    ctrlRef.current = ctrl;
    try {
      await ctrl.promise;
      setPhase((p) => (p === 'running' ? (failed ? 'error' : 'done') : p));
      if (!failed) setText(''); // keep the text on failure so a retry is one Enter away
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setPhase('error');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') hide();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const go = (to) => {
    hide();
    navigate(to);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={hide} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Tell Nexus anything"
        className="relative w-full max-w-2xl rounded-2xl border border-surface-border bg-surface-1/95 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] overflow-hidden"
        initial={{ y: -10, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -6, scale: 0.98 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        {/* signal line — animates while Nexus is working */}
        <div className="h-[2px] bg-surface-border overflow-hidden">
          <div
            className={cn(
              'h-full w-1/3 bg-gradient-to-r from-transparent via-nexus-primary to-transparent',
              phase === 'running' ? 'animate-[capture-scan_1.1s_ease-in-out_infinite]' : 'opacity-0'
            )}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-3.5">
          <Sparkles size={18} className="shrink-0 text-nexus-primary" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Tell Nexus anything — applied somewhere, a deadline, a question…"
            aria-label="Tell Nexus anything"
            className="flex-1 bg-transparent text-base text-text-primary placeholder:text-text-muted focus:outline-none"
            disabled={phase === 'running'}
          />
          <VoiceButton onTranscript={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} />
          <button
            onClick={submit}
            disabled={!text.trim() || phase === 'running'}
            aria-label="Send"
            className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-nexus-primary text-on-accent hover:bg-nexus-primary-hover disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowUp size={17} strokeWidth={2.5} />
          </button>
        </div>

        <div className="border-t border-surface-border px-4 py-3 min-h-[64px]">
          {phase === 'idle' && (
            <div className="flex flex-wrap gap-2">
              {HINTS.map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setText(h);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-surface-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-nexus-primary/40 transition-colors"
                >
                  {h}
                </button>
              ))}
            </div>
          )}

          {phase === 'running' && actions.length === 0 && !reply && (
            <p className="text-sm text-text-secondary">Nexus is on it…</p>
          )}

          {actions.some(isShownAction) && (
            <ul className="space-y-1.5 mb-2">
              {actions.filter(isShownAction).map((a, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
                  <ActionItem action={a} onNavigate={go} hint='or type "yes"' />
                </motion.li>
              ))}
            </ul>
          )}

          {reply && <p className="text-sm text-text-secondary whitespace-pre-wrap max-h-48 overflow-y-auto">{reply}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-surface-border text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft size={11} /> {phase === 'done' ? 'capture another' : 'send'}
          </span>
          <span className="font-mono">esc to close · ctrl K</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default CommandBar;
