// Voice mode entry point in the top bar. Hold the orb (or Ctrl+Alt+Space anywhere
// in Nexus) to talk; release to send. A quick click opens the transcript panel and
// connects ahead of time so the first press doesn't wait on setup.
import { useEffect, useRef } from 'react';
import { Mic, Loader2, AlertCircle } from 'lucide-react';
import { useVoiceStore } from '../../store/useVoiceStore.js';
import { pressStart, pressEnd, warmUp, shutdown, stopAll } from '../../lib/voice/engine.js';
import { hasWaiting } from '../../lib/confirmations.js';
import { cn } from '../../lib/utils.js';
import { VoicePanel } from './VoicePanel.jsx';

const HOLD_MS = 220; // shorter than this is a click, not push-to-talk
const isHotkey = (e) => e.code === 'Space' && e.ctrlKey && e.altKey;

const LOOK = {
  off: 'border-surface-border bg-surface-2/70 text-text-muted hover:text-text-secondary hover:border-nexus-primary/45',
  connecting: 'border-nexus-primary/40 bg-surface-2/70 text-nexus-primary',
  ready: 'border-nexus-primary/60 bg-nexus-primary/10 text-nexus-primary signal-glow',
  listening: 'border-danger bg-danger text-white',
  thinking: 'border-nexus-primary/60 bg-surface-2 text-nexus-primary',
  speaking: 'border-nexus-primary bg-nexus-primary text-on-accent signal-glow',
  error: 'border-danger/60 bg-danger/10 text-danger'
};

export function VoiceOrb() {
  const status = useVoiceStore((s) => s.status);
  const panelOpen = useVoiceStore((s) => s.panelOpen);
  const setPanelOpen = useVoiceStore((s) => s.setPanelOpen);
  const wrapRef = useRef(null);
  const hold = useRef({ timer: null, held: false, suppressClick: false });

  // In-app push-to-talk shortcut. (The tray helper will make it global in Phase 4.)
  useEffect(() => {
    let keyHeld = false;
    const release = () => {
      if (!keyHeld) return;
      keyHeld = false;
      pressEnd();
    };
    const onDown = (e) => {
      if (!isHotkey(e)) return;
      e.preventDefault();
      if (e.repeat || keyHeld) return;
      keyHeld = true;
      pressStart();
    };
    const onUp = (e) => {
      if (e.code === 'Space' || e.key === 'Control' || e.key === 'Alt') release();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', release); // a release we never saw must not leave the mic open
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', release);
    };
  }, []);

  // Kill switch: Esc silences Nexus and cancels anything waiting for a yes. Only
  // claims Esc while voice has something to stop, so dialogs keep their Esc.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const { status: s } = useVoiceStore.getState();
      if (['speaking', 'thinking'].includes(s) || hasWaiting()) stopAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => shutdown(), []); // leaving the app (sign-out) ends the session

  // Close the panel on an outside click, but never mid-conversation.
  useEffect(() => {
    if (!panelOpen) return;
    const onClick = (e) => {
      const busy = ['listening', 'thinking', 'speaking'].includes(useVoiceStore.getState().status);
      if (!busy && !wrapRef.current?.contains(e.target)) setPanelOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [panelOpen, setPanelOpen]);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const h = hold.current;
    h.held = false;
    h.timer = setTimeout(() => {
      h.held = true;
      pressStart();
    }, HOLD_MS);
  };
  const onPointerUp = () => {
    const h = hold.current;
    clearTimeout(h.timer);
    if (h.held) {
      h.held = false;
      h.suppressClick = true;
      pressEnd();
    }
  };
  const onClick = () => {
    if (hold.current.suppressClick) {
      hold.current.suppressClick = false;
      return;
    }
    setPanelOpen(!panelOpen);
    if (status === 'off' || status === 'error') warmUp();
  };

  const Icon = status === 'connecting' ? Loader2 : status === 'error' ? AlertCircle : Mic;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Voice: hold to talk, click for transcript"
        aria-expanded={panelOpen}
        title="Hold to talk (Ctrl+Alt+Space)"
        className={cn(
          'relative w-9 h-9 rounded-full border grid place-items-center transition-colors select-none touch-none',
          LOOK[status] ?? LOOK.off
        )}
      >
        {status === 'listening' && (
          <span aria-hidden className="absolute inset-0 rounded-full bg-danger/40 animate-ping" />
        )}
        {status === 'thinking' && (
          <span
            aria-hidden
            className="absolute -inset-px rounded-full border-2 border-transparent border-t-nexus-primary animate-spin"
          />
        )}
        <Icon size={16} className={cn('relative', status === 'connecting' && 'animate-spin')} />
      </button>
      {panelOpen && <VoicePanel onClose={() => setPanelOpen(false)} />}
    </div>
  );
}

export default VoiceOrb;
