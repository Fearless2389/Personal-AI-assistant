# Phase 0 — voice spike findings (2026-11-12)

**Verdict: GO.** Every Phase 0 question came back positive. Nothing here is wired into the app;
this folder is a throwaway test bench that Phase 1 will replace.

## What was tested

| # | Question | Result |
| --- | --- | --- |
| 1 | Can the server mint a short-lived token so the browser never sees the Gemini key? | **Yes.** ~0.6 s per token. Single-use, 1 min to start a session, 30 min to finish it. |
| 2 | Real voice in → voice out in the browser, push-to-talk, barge-in? | **Yes.** Fake-mic Chromium run, 3 rounds, details below. |
| 3 | Does a tool call work mid-conversation and come back as speech? | **Yes.** `list_upcoming` called ~0.5 s after release; answer read back correctly. |
| 4 | Free tier, non-retiring model? | **Yes.** `gemini-3.8-live` is Google's current recommended Live model and is "Free of charge" on the free tier. |
| 5 | Can a global hotkey drive the open tab? | **Yes.** `tray.ps1` (PowerShell + inline C#, no install): hold Ctrl+Alt+Space → down/up reach the tab over SSE in ~12 ms. |

## Measured (gemini-3.8-live, laptop on home Wi-Fi)

| Step | Time |
| --- | --- |
| Token mint | 0.55–0.8 s |
| Socket open → `setupComplete` | **1.7–2.8 s** ← the slow part |
| Release key → tool call | ~0.5 s |
| Release key → first spoken audio, **with** a tool call | 0.9–1.0 s |
| Release key → first spoken audio, no tool | ~0.7 s |
| Press key while it talks → audio stops (`interrupted`) | ~60 ms |
| Hotkey → browser tab (tray → server → SSE) | ~12 ms |

Transcription of the synthetic voice was accurate ("What's do this week?" — one homophone slip,
didn't affect the answer). Output audio is 24 kHz 16-bit PCM; input is 16 kHz.

## Things the docs got wrong / we learned the hard way

1. **REST token field name.** Docs say `liveConnectConstraints`; the REST API rejects it. The
   working field is `bidiGenerateContentSetup` on `POST v1beta/auth_tokens`.
2. **Lock the whole setup in the token.** With only the model locked, the client's system prompt
   and tools were silently ignored (it answered "I don't have access to your schedule"). Locking
   prompt + tools + voice + VAD mode server-side fixed it — and is the safer design anyway: the
   browser can't add tools or rewrite the prompt.
3. **A tool call ends its own silent turn.** `turnComplete` arrives right after `toolCall`; the
   spoken answer is the *next* turn. Client logic must not treat the first `turnComplete` as "done".
4. Push-to-talk = `automaticActivityDetection.disabled: true` + `activityStart` / `activityEnd`.
   With `START_OF_ACTIVITY_INTERRUPTS`, pressing the key mid-answer is the barge-in.

## Design consequences for Phase 1

- **Pre-warm the session.** 2–3 s setup is too slow to pay on every press. Connect when Nexus
  opens (or on first press) and keep it alive; use session resumption (handles valid 2 h) to
  survive the ~10 min connection limit, and context-window compression to lift the 15 min
  audio-session cap. Also stop the local playback instantly on key-down, as the spike does.
- **Persona prompt must be general.** The placement-only spike prompt refused a general question
  ("I can't provide detailed stories"). Jarvis should be broad, with placement context, not limited to it.
- **Tools run on the Nexus server, not in the browser.** The spike answers tool calls with a stub
  in the page. In v1 the page forwards each `toolCall` to an authenticated Nexus endpoint that
  reuses `handleToolCall` + the confirmation gate, and returns the result.
- **Browsers need one click per page load before audio can play.** The tray hotkey can start
  listening in a background tab only after the tab was clicked once (an "Arm voice" step, or
  any click in Nexus). Phase 1 needs a visible "voice ready" indicator for this.
- **Hotkey:** Ctrl+Alt+Space was free on this machine. The helper reports `HOTKEY_TAKEN` if not.

## Still open (not blockers)

- **Exact free-tier quotas** for Live models aren't published; they're only on your AI Studio
  rate-limit dashboard. ~8 sessions during this spike hit no limit.
- **Real-mic quality** (your voice, room noise, Indian-English accent) — the automated run used a
  synthetic Windows voice. Needs one manual session: see "Try it yourself".
- **Background-tab behaviour** in your actual Chrome (the test page was visible).
- **Supabase is still paused**, so `list_upcoming` returned stub data, not your real deadlines.

## Try it yourself (~2 min)

```bash
node spikes/live-voice/server.mjs                                   # terminal 1
powershell -ExecutionPolicy Bypass -File spikes/live-voice/tray.ps1 # terminal 2 (optional)
```

Open <http://127.0.0.1:5180>, click **Arm voice**, allow the mic, then hold Space (or
Ctrl+Alt+Space from any app) and ask "what's due this week?". Interrupt it by pressing again
while it talks. Quick Node-only check without a mic: `node spikes/live-voice/probe.mjs`.

## Files

- `lib.mjs` — token minting, locked setup, stub tool. `server.mjs` — local test server (127.0.0.1:5180).
- `index.html` — mic capture (AudioWorklet → 16 kHz PCM), playback queue, push-to-talk, barge-in.
- `tray.ps1` — global hotkey tray helper. `probe.mjs` — Node-only round-trip timing.
