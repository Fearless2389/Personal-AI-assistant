// Global push-to-talk bridge: the tray helper's Alt+Space presses arrive
// over GET /api/hotkey/events and drive the voice engine, even when Nexus is in a
// background tab. Exactly one tab listens (Web Locks), so two open tabs never both
// open the mic. A lost key-up can't leave the mic on: a hold auto-releases.
import { streamHotkeyEvents } from '../api.js';
import { useVoiceStore } from '../../store/useVoiceStore.js';
import { pressStart, pressEnd } from './engine.js';

const LOCK = 'nexus-hotkey-listener';
const MAX_HOLD_MS = 60_000;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;

let holdTimer = null;
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

function onDown() {
  // Browsers block audio until the page has had one click/keypress (autoplay rule).
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    useVoiceStore.setState({
      panelOpen: true,
      status: 'error',
      error: 'Click anywhere in the Nexus tab once (a browser rule for audio), then the hotkey works.'
    });
    return;
  }
  clearTimeout(holdTimer);
  holdTimer = setTimeout(onUp, MAX_HOLD_MS);
  pressStart();
}

function onUp() {
  clearTimeout(holdTimer);
  holdTimer = null;
  pressEnd();
}

async function listen(signal) {
  let wait = RETRY_MIN_MS;
  while (!signal.aborted) {
    try {
      await streamHotkeyEvents({
        signal,
        onEvent: (e) => {
          wait = RETRY_MIN_MS; // a live stream resets the backoff
          if (e.type === 'down') onDown();
          else if (e.type === 'up') onUp();
        }
      });
    } catch (err) {
      if (signal.aborted) return;
      if (err.status === 503) return; // hotkey not configured on the server: stay quiet
    }
    if (holdTimer) onUp(); // the stream dropped mid-hold: release
    await sleep(wait, signal);
    wait = Math.min(wait * 2, RETRY_MAX_MS);
  }
}

/** Start listening (in at most one tab). Returns a stop function. */
export function startHotkeyBridge() {
  const ctrl = new AbortController();
  const run = () => listen(ctrl.signal);
  if (navigator.locks?.request) {
    navigator.locks.request(LOCK, { signal: ctrl.signal }, run).catch(() => {}); // AbortError when stopped while waiting
  } else {
    run();
  }
  return () => {
    ctrl.abort();
    if (holdTimer) onUp();
  };
}
