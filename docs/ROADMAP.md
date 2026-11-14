# Nexus Roadmap — toward "Jarvis"

Living document. Every idea we've discussed lives here with a status, so we can add, cut or
re-prioritise without losing anything. Edit freely; log meaningful changes in the changelog at
the bottom.

**Status legend:** `shipped` · `v1` (Jarvis v1, building next) · `next` (after v1) ·
`later` (wanted, not scheduled) · `idea` (unvalidated) · `cut` (decided against — kept for the record)

---

## Vision

Speak to Nexus and it does the thing. Not a chat box with a mic: an agent that hears you, decides
which of its tools to use, acts on your Nexus data, your Google account and the web, talks back
naturally, and asks first before anything you can't take back.

## Decisions so far (2026-11-11)

| Decision | Choice | Why |
| --- | --- | --- |
| v1 reach | Nexus + Google account + the web | Pure web app — no install. Laptop/phone control deferred. |
| How you start talking | Push-to-talk hotkey | Reliable, never listens by accident. Scope still open — see Q1. |
| How it answers | Natural, interruptible voice | Real-time speech-to-speech (Gemini Live API). |
| Autonomy | Confirm risky actions only | Safe things happen instantly; irreversible/outward things wait for "yes". |
| Cost | Free tier only (standing rule) | Live API native-audio models are free-tier eligible; limits are per-project, unpublished. |
| Hotkey scope | Global, via a tiny tray helper | Press anywhere on the laptop; helper's only job is hotkey → "start listening". |
| Language | English only | Most accurate; Hindi/Telugu stays a `later` item. |
| Web depth | Read-only | Search, read, summarise, research. No acting on logged-in sites in v1. |
| Devices | Laptop browser only | Phone stays deferred. |

## Open questions

None blocking. New ones get added here as they come up.

---

## Architecture sketch (v1)

```
 hotkey / mic ──► browser ◄──── audio both ways ────► Gemini Live session (native audio)
                     │                                        │
                     │  tool calls (function calling) ◄────────┘
                     ▼
              Nexus server  ── confirmation gate ──► Nexus DB · Google APIs · web fetch/search
                     │
                     └── action log (what was done, when, by which utterance)
```

- The browser never holds the Gemini API key: the server mints a short-lived ephemeral token.
- Tool execution stays server-side so every action passes the same auth, RLS and confirmation gate.
- Risky tools return "needs confirmation" instead of acting; the voice asks, the next "yes" executes.

---

## Capability catalogue

### 1. Voice I/O

| Item | Status | Notes |
| --- | --- | --- |
| Web Speech mic button (chat, ⌘K) | shipped | Chrome-only, one-shot dictation. |
| Push-to-talk inside Nexus (hold orb or Ctrl+Alt+Space) | shipped | Phase 1. `components/voice/VoiceOrb.jsx`. |
| Push-to-talk hotkey (global, via tray helper) | v1 | Phase 4. Spike works: `spikes/live-voice/tray.ps1`. See section 6. |
| Real-time voice conversation (Gemini Live) | shipped | Phase 1. `gemini-3.8-live` (free tier). ~0.7–0.9 s to first spoken word, ~1.5 s with a tool call. Click the orb to pre-warm (setup 2–3 s). |
| Barge-in (interrupt it mid-sentence) | shipped | Phase 1. Local playback stops at once; server confirms with `interrupted`. |
| Live transcript + action chips while speaking | shipped | Phase 1. Shared `ActionChip` with ⌘K. Voice turns saved to conversations (memory). |
| Session resumption across the ~10 min connection limit | v1 | Phase 1 reconnects fresh on the next press (in-session context lost; saved turns kept). |
| Voice persona / choice of voice | next | |
| Wake word ("Hey Nexus") | later | Needs an always-on local process. |
| Hindi/Telugu code-mixing | later | v1 is English only. |
| Speaks the morning briefing aloud | next | Pairs with the existing briefing engine. |

### 2. Brain & safety

| Item | Status | Notes |
| --- | --- | --- |
| 20 Nexus tools, 3-round tool chaining | shipped | `services/tools.js`, shared by chat and voice. Phase 3 added `manage_*` (one per section, by name) + Gmail + calendar edits. |
| Confirmation gate for risky tools | shipped | Phase 2. `actionPolicy.js` risk table (safe / confirm / never; unknown = confirm). Tap Confirm or say yes; the yes is checked against your mic transcript, not the model. 2-min expiry. |
| Action log ("what did you just do?") | shipped | Phase 2. `action_log` (migration 006), voice + chat, Settings → Recent actions, `list_recent_actions` tool. |
| Undo for logged actions | next | Log has what's needed (tool + args + result ids). |
| Gate typed chat too | shipped | Phase 3. Chat/⌘K show the same confirmation card; a typed "yes" also counts. |
| Voice parity with the pages | shipped | Phase 3. Habits, tasks, notes, goals, reminders, calendar events: everything the pages can do. |
| Prompt-injection guard | shipped | Phase 3 (email). Email content is marked untrusted (invisible characters stripped); sends always need the user's own yes with the recipient shown. Red-team: a malicious email was read 9×, acted on 0×. Web pages join in Phase 4. |
| Kill switch ("stop" cancels everything in flight) | shipped | Phase 2. Esc / Stop button silences Nexus and cancels every pending action; saying "stop" or "cancel" cancels via the model. A tool already running on the server finishes. |
| Multi-step plans ("prep me for tomorrow's OA") | next | Plan → confirm → execute. |
| Long-term preference learning | idea | |

### 3. Nexus (own data)

| Item | Status | Notes |
| --- | --- | --- |
| Notes, tasks, applications, habits, reminders, memory search | shipped | |
| Today timeline, nudges, pipeline | shipped | |
| Voice navigation ("open my applications") | v1 | Client-side tool. |
| Task recurrence + subtasks | later | |
| Task ↔ goal linking | later | |
| Notes debounced autosave | later | |
| Weekly habits honour target days in streaks | later | Currently every habit streaks daily. |
| Focus session persistence across reloads | later | |

### 4. Google account

| Item | Status | Notes |
| --- | --- | --- |
| Calendar read + create | shipped | PKCE OAuth, encrypted tokens. |
| Calendar edit / reschedule / delete | shipped | Phase 3. `manage_calendar_event`; moving the start keeps the length; update/delete = confirm. |
| Gmail search + summarise ("anything from Amazon recruiting?") | shipped | Phase 3. Needs the Gmail API enabled + one reconnect (scopes: gmail.readonly, gmail.compose). |
| Gmail draft reply | shipped | Phase 3. Safe — lands in Drafts, threaded under the original. |
| Gmail send | shipped | Phase 3. Always confirm; recipients validated and pinned before the readback. |
| Google OAuth app out of "Testing" | next | Testing mode expires refresh tokens every 7 days (likely why Calendar showed "broken"). Your call: publish unverified. |
| Auto-detect placement emails → update application cards | next | Biggest placement-season win; needs careful parsing. |
| Drive search + read docs | next | |
| Create Docs / Sheets | later | |

### 5. The web

| Item | Status | Notes |
| --- | --- | --- |
| Web search with sources | v1 | Gemini grounding with Google Search. |
| Read + summarise a URL | v1 | Server-side fetch. |
| Company research before an interview | v1 | Search + summarise into a note. |
| Act on logged-in sites (portals, forms) | next | Moved into the browser agent track (section 6b). v1 stays read-only. |
| Track job postings / new openings | next | Browser agent: watch portals for new drives, nudge in Nexus. |

### 6b. Browser agent — the "Alma track" (after v1)

Direction (2026-11-14): Nexus becomes an Alma-style agent (alma.inc: "sees your screen and steers any
app"), but **browser first, with full control, behind the confirmation gate**. Once that is reliable,
extend to local Windows apps (section 6).

| Item | Status | Notes |
| --- | --- | --- |
| Agent-controlled browser with your logins | next | A dedicated Chromium profile driven locally (Playwright/CDP), so sessions persist and your daily browser is untouched. |
| See → decide → act loop | next | Page screenshot + accessibility tree → Gemini picks an action (navigate, click, type, scroll, read) → repeat. Live step feed + screenshots in the voice panel. |
| Gate every browser action by risk | next | Read/navigate = safe; submit, send, pay, delete, change password, accept/decline offer = confirm; banking/trading transfers and password-manager exports = never. Reuses `actionPolicy.js` + `action_log`. |
| Prompt-injection guard for pages | next | Page text is data, never instructions; a page can't widen what the agent may do. |
| Kill switch + step budget | next | Esc stops the browser mid-task; max steps per task; every step logged with a screenshot. |
| Placement portal flows | next | Watch for new drives, pre-fill application forms, stop before Submit for your yes. First real use case. |
| Local apps (Alma-style, whole screen) | later | Only after the browser agent is reliable. Windows UI Automation + screen vision. |

### 6. Laptop control (local agent) — hotkey in v1, the rest deferred

| Item | Status | Notes |
| --- | --- | --- |
| Tray helper for the global push-to-talk hotkey | v1 | Hotkey → focus Nexus + start/stop listening. First local component. |
| Open apps / files / URLs, media, volume | later | Needs a local companion app. |
| Screen understanding (screenshot + vision) | later | |

### 7. Phone — deferred

| Item | Status | Notes |
| --- | --- | --- |
| Use Nexus voice from the phone (PWA) | later | v1 is laptop only; needs deployment. |
| Calls / texts / alarms | later | Hardest surface. |

### 8. Delivery & platform

| Item | Status | Notes |
| --- | --- | --- |
| Morning briefing engine (8 AM IST, tz-correct) | shipped | Generated daily; delivery is in-app/log only. |
| Briefing push channel (Telegram / WhatsApp / SMS) | later | Seam ready in `briefingDelivery.js`. |
| Deploy (always-on server) | next | Scheduler only runs while the server runs; Supabase free tier pauses after ~7 idle days. |
| Code-split the client bundle (~820 KB) | later | |
| Fix 10 pre-existing lint errors | later | `set-state-in-effect` in older pages + 3 unused imports. |
| Habit dates use the server clock | next | `habitService.dayStr` uses the server's timezone; fine on the laptop, off by a day once deployed (UTC). The assistant's tool already passes the user's date. |
| Chat model fallback + request timeout | next | 2026-11-14: `gemini-flash-latest` hung (no response for minutes) while `gemini-flash-lite-latest` answered in ~1 s. Chat has no timeout, so it just spins. Add a timeout and a configurable fallback model. |
| Chat composer under the mobile nav | next | At phone width the chat input sits partly behind the bottom navigation bar. |

### 9. Small UX ideas

| Item | Status | Notes |
| --- | --- | --- |
| Board keyboard moves (1–5 sets stage) | idea | |
| Paste a job link into ⌘K → wishlist card | idea | |

---

## Changelog

- **2026-11-11** — Created. Captured Jarvis v1 decisions (reach, trigger, voice, autonomy), open
  questions Q1–Q4, and all previously deferred items.
- **2026-11-11** — Resolved Q1–Q4: global hotkey via tray helper, English only, read-only web,
  laptop only.
- **2026-11-12** — Phase 0 spike: GO. Ephemeral tokens, push-to-talk, barge-in, voice tool call
  and the tray hotkey all verified (`spikes/live-voice/FINDINGS.md`).
- **2026-11-14** — Phase 1 (voice core) built: voice orb + transcript panel, locked-setup tokens,
  tools via the shared dispatcher, voice turns saved to memory. Also fixed model datetimes with no
  offset being stored as UTC (affected text chat too). Verified against live Supabase and pushed.
- **2026-11-14** — Phase 3 built: voice/chat parity with every section (`manage_*` tools, find by
  name), Gmail search/read/draft/send, calendar edit/delete, typed chat gated with the same cards,
  prompt-injection guard + red-team, voice backstop for a missed spoken "yes". Fixed: chat tool chaining
  broke on Gemini 3 (thought signatures dropped by the SDK's stream merge).
- **2026-11-14** — Added section 6b, the browser agent ("Alma track"): full browser control behind
  the confirmation gate first, local apps later. Placement portals are the first use case.
- **2026-11-14** — Phase 2 (safety layer) built: confirmation gate (calendar + SMS wait for a tap or a
  spoken yes), action log for voice and chat, Esc kill switch, recent actions in Settings.
