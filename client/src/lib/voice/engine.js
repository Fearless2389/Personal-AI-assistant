// Voice mode engine: push-to-talk → Gemini Live → spoken answer, with Nexus tools.
// Framework-free; React reads progress from useVoiceStore. One engine per tab.
//
// Flow: press → mic chunks buffer while the session connects (first press only,
// ~2–3 s) → activityStart + audio → release → activityEnd → the model may call
// tools (relayed to /api/voice/tool, run server-side) → it speaks → turn saved to
// conversations. Pressing again while it speaks interrupts it (barge-in).
import { useVoiceStore, MAX_TURNS } from '../../store/useVoiceStore.js';
import { useRefreshStore, keysForTool } from '../../store/useRefreshStore.js';
import { voiceApi } from '../api.js';
import { MicCapture, PcmPlayer } from './audio.js';
import { LiveSession } from './liveSession.js';
import { trackParked, applyResolution, resolveByTap, cancelAllWaiting } from './confirmations.js';

// Close the socket and release the mic after this long without talking, so the
// browser's recording indicator doesn't stay on and the free quota isn't held open.
const IDLE_CLOSE_MS = 5 * 60_000;

const set = useVoiceStore.setState;
const get = useVoiceStore.getState;

let mic = null;
let micStarting = null;
let player = null;
let session = null;
let connecting = null; // promise while a session is opening
let retiring = false; // server sent goAway: open a fresh session on the next press
let sessionId = null; // conversations.session_id shared by every turn in this tab
let talking = false; // key/orb held
let flushing = false; // sending the last buffered mic audio after release
let serverActive = false; // activityStart sent for the current utterance
let backlog = []; // mic chunks captured before the socket was ready
let heardId = null; // turn receiving the user's transcript
let answerId = null; // turn receiving the model's transcript, tools and audio
let toolTurnOpen = false; // a toolCall arrived; its silent turnComplete is not the answer
let muted = false; // kill switch pressed: drop the rest of the current answer's audio
let idleTimer = null;

const setStatus = (status, error = null) => set({ status, error });
const findTurn = (id) => get().turns.find((t) => t.id === id);
const patchTurn = (id, fn) => set((s) => ({ turns: s.turns.map((t) => (t.id === id ? fn(t) : t)) }));

function friendlyError(err) {
  if (err?.name === 'NotAllowedError') return 'Microphone is blocked. Allow it from the address bar, then try again.';
  if (err?.name === 'NotFoundError') return 'No microphone found.';
  if (err?.status === 401) return 'Your login expired. Sign in again.';
  if (err?.status === 429 || /quota|exhausted|429/i.test(err?.message ?? '')) {
    return "Gemini's free voice quota is used up for now. Try again in a bit.";
  }
  if (/failed to fetch/i.test(err?.message ?? '')) return "Couldn't reach the Nexus server.";
  return err?.message || 'Voice failed. Try again.';
}

// ---- audio + connection -------------------------------------------------------

/** Create the speaker synchronously (inside the gesture) and start the mic once. */
function ensureAudio() {
  if (!player) {
    player = new PcmPlayer({
      onIdle: () => {
        if (get().status === 'speaking') setStatus('ready');
      }
    });
  }
  player.resume();
  if (mic) return Promise.resolve();
  micStarting ??= (async () => {
    const m = new MicCapture(onMicChunk);
    await m.start();
    mic = m;
  })().finally(() => {
    micStarting = null;
  });
  return micStarting;
}

function ensureSession() {
  if (session?.ready && !retiring) return Promise.resolve();
  if (connecting) return connecting;
  session?.close();
  session = null;
  retiring = false;
  toolTurnOpen = false;
  connecting = (async () => {
    if (!talking) setStatus('connecting');
    const { token } = await voiceApi.session();
    const s = new LiveSession(
      token,
      handlersFor(() => s)
    );
    session = s;
    await s.open();
    sessionId ??= `voice-${crypto.randomUUID()}`;
  })()
    .catch((err) => {
      session = null;
      throw err;
    })
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

function onMicChunk(b64) {
  if (!talking && !flushing) return;
  if (serverActive && session?.ready) session.sendAudio(b64);
  else backlog.push(b64);
}

// ---- utterances -----------------------------------------------------------------

/** Key/orb pressed: start listening right away; audio buffers until connected. */
export async function pressStart() {
  if (talking) return;
  talking = true;
  serverActive = false;
  muted = false;
  backlog = [];
  clearTimeout(idleTimer);
  player?.stop(); // barge-in: silence locally at once; the server confirms with `interrupted`
  persistTurn(answerId);

  heardId = crypto.randomUUID();
  set((s) => ({
    panelOpen: true,
    turns: [...s.turns, { id: heardId, heard: '', said: '', actions: [], interrupted: false }].slice(-MAX_TURNS)
  }));
  setStatus('listening');

  try {
    await ensureAudio();
    await ensureSession();
  } catch (err) {
    talking = false;
    backlog = [];
    dropIfEmpty(heardId);
    setStatus('error', friendlyError(err));
    return;
  }

  session.activityStart();
  serverActive = true;
  for (const b64 of backlog) session.sendAudio(b64);
  backlog = [];
  if (!talking) finishUtterance(); // released while we were still connecting
}

/** Key/orb released. */
export function pressEnd() {
  if (!talking) return;
  talking = false;
  if (serverActive) finishUtterance(); // otherwise pressStart finishes once connected
}

function finishUtterance() {
  flushing = true;
  mic?.flush();
  flushing = false;
  session?.activityEnd();
  serverActive = false;
  answerId = heardId;
  setStatus('thinking');
  scheduleIdle();
}

/** A click (not a hold): connect ahead of time so the first press is instant. */
export async function warmUp() {
  if (talking) return;
  try {
    await ensureAudio();
    await ensureSession();
    if (!talking && get().status === 'connecting') setStatus('ready');
    scheduleIdle();
  } catch (err) {
    setStatus('error', friendlyError(err));
  }
}

/**
 * Kill switch (Esc, or the Stop button): silence Nexus now, drop the rest of what it
 * was saying, and cancel every action still waiting for a yes. The session stays
 * open, so the next press works straight away.
 */
export function stopAll() {
  player?.stop();
  muted = true;
  if (['speaking', 'thinking'].includes(get().status)) setStatus(session?.ready ? 'ready' : 'off');
  return cancelAllWaiting();
}

/**
 * The Confirm / Cancel buttons on a parked action. The server runs (or drops) it,
 * then Nexus is told what happened so it can say so out loud.
 */
export async function confirmByTap(id, decision) {
  const res = await resolveByTap(id, decision);
  if (!res) return;
  const outcome = res.error ? `${res.status} (${res.error})` : res.status;
  tellModel(
    decision === 'confirm' ? 'Tapped Confirm' : 'Tapped Cancel',
    `[Rama tapped ${decision === 'confirm' ? 'Confirm' : 'Cancel'} for: ${res.summary}. Outcome: ${outcome}. ` +
      'Acknowledge it in one short sentence. Do not call resolve_pending_action for this one.]'
  );
}

/** Send a non-spoken cue to the model as its own turn, so its reply is shown under it. */
function tellModel(cue, text) {
  if (!session?.ready || talking) return;
  persistTurn(answerId);
  const id = crypto.randomUUID();
  heardId = answerId = id;
  set((s) => ({
    turns: [...s.turns, { id, heard: '', cue, said: '', actions: [], interrupted: false }].slice(-MAX_TURNS)
  }));
  muted = false;
  setStatus('thinking');
  session.sendText(text);
  scheduleIdle();
}

/** End the voice session: close the socket, release the microphone, cancel anything pending. */
export function shutdown() {
  cancelAllWaiting();
  clearTimeout(idleTimer);
  persistTurn(answerId);
  talking = false;
  serverActive = false;
  backlog = [];
  session?.close();
  session = null;
  mic?.stop();
  mic = null;
  player?.stop();
  setStatus('off');
}

export function clearTranscript() {
  set({ turns: [] });
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (talking || player?.playing) return scheduleIdle();
    shutdown();
  }, IDLE_CLOSE_MS);
}

function dropIfEmpty(id) {
  const t = findTurn(id);
  if (t && !t.heard && !t.said && !t.actions.length) set((s) => ({ turns: s.turns.filter((x) => x.id !== id) }));
}

/** Save one spoken exchange to conversations (long-term memory). Once per turn. */
function persistTurn(id) {
  const t = findTurn(id);
  if (!t || t.saved || !sessionId || (!t.heard.trim() && !t.said.trim())) return;
  patchTurn(id, (x) => ({ ...x, saved: true }));
  voiceApi.turn({ sessionId, heard: t.heard, said: t.said }).catch((err) => {
    console.warn('[voice] could not save turn:', err.message);
  });
}

// ---- tools ----------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * What the user said this turn (their mic transcript, never the model's words).
 * A spoken yes is approved only from this, and the transcript can trail the
 * tool call by a beat, so a confirmation waits up to ~1.5 s for it.
 */
async function utteranceFor(turnId, name) {
  const read = () => findTurn(turnId)?.heard?.trim() ?? '';
  let text = read();
  for (let i = 0; name === 'resolve_pending_action' && !text && i < 15; i++) {
    await sleep(100);
    text = read();
  }
  return text;
}

const callKey = (c) => `${c.name}:${JSON.stringify(c.args ?? {}, Object.keys(c.args ?? {}).sort())}`;

/**
 * Run the model's tool calls on the Nexus server, one after another (two
 * track_application calls in parallel could both miss the existing card and
 * create duplicates). Identical repeats in one message run once — Gemini Live
 * was seen sending the same call twice in a single toolCall.
 */
async function runTools(calls, turnId) {
  const groups = new Map();
  for (const c of calls) groups.set(callKey(c), [...(groups.get(callKey(c)) ?? []), c]);

  const responses = [];
  for (const group of groups.values()) {
    const { name, args = {} } = group[0];
    let result;
    try {
      const utterance = await utteranceFor(turnId, name);
      ({ result } = await voiceApi.tool(name, args, { utterance, sessionId }));
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    patchTurn(turnId, (t) => ({ ...t, actions: [...t.actions, { name, args, result }] }));
    if (name === 'resolve_pending_action') applyResolution(result);
    else if (!trackParked(result) && result?.ok !== false) useRefreshStore.getState().bump(...keysForTool(name));
    for (const c of group) responses.push({ id: c.id, name, response: { result } });
  }
  session?.toolResponse(responses);
}

// ---- server events --------------------------------------------------------------

function handlersFor(self) {
  const live = () => self() === session; // ignore events from a session we've replaced
  return {
    onAudio(b64) {
      if (!live() || talking || muted) return; // the user is talking over it, or pressed stop
      if (get().status !== 'speaking') setStatus('speaking');
      player.play(b64);
    },
    onHeard(text) {
      if (live()) patchTurn(heardId, (t) => ({ ...t, heard: t.heard + text }));
    },
    onSaid(text) {
      if (live()) patchTurn(answerId, (t) => ({ ...t, said: t.said + text }));
    },
    onToolCall(calls) {
      if (!live()) return;
      toolTurnOpen = true;
      runTools(calls, answerId);
    },
    onInterrupted() {
      if (!live()) return;
      player?.stop();
      patchTurn(answerId, (t) => ({ ...t, interrupted: true }));
    },
    onTurnComplete() {
      if (!live()) return;
      // A tool call ends its own silent turn; the spoken answer comes in the next
      // one, after we send the tool result. Keep "thinking" until then.
      if (toolTurnOpen) {
        toolTurnOpen = false;
        return;
      }
      muted = false;
      if (findTurn(answerId)?.said) persistTurn(answerId);
      if (!talking && get().status === 'thinking') setStatus('ready');
    },
    onGoAway() {
      retiring = true;
    },
    onClose({ code, reason }) {
      if (!live()) return;
      session = null;
      serverActive = false;
      if (get().status === 'off') return;
      if (code === 1000) return setStatus('off');
      setStatus('error', friendlyError(new Error(reason || 'Voice connection dropped. Press again to reconnect.')));
    }
  };
}
