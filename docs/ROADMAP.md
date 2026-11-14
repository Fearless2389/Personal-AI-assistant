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
| Push-to-talk hotkey (global, via tray helper) | v1 | See section 6. |
| Real-time voice conversation (Gemini Live) | v1 | `gemini-3.8-live` (free tier, current). Phase 0 spike: ~1 s to first spoken word incl. a tool call; setup 2–3 s, so pre-warm the session. See `spikes/live-voice/FINDINGS.md`. |
| Barge-in (interrupt it mid-sentence) | v1 | Native to the Live API. |
| Live transcript + action chips while speaking | v1 | Reuse `toolSummary.js` chips. |
| Voice persona / choice of voice | next | |
| Wake word ("Hey Nexus") | later | Needs an always-on local process. |
| Hindi/Telugu code-mixing | later | v1 is English only. |
| Speaks the morning briefing aloud | next | Pairs with the existing briefing engine. |

### 2. Brain & safety

| Item | Status | Notes |
| --- | --- | --- |
| 9 Nexus tools, 3-round tool chaining | shipped | `routes/chat.js`. |
| Confirmation gate for risky tools | v1 | Per-tool risk level: safe / confirm / never. |
| Action log ("what did you just do?") + undo where possible | v1 | Every voice action recorded with its utterance. |
| Prompt-injection guard | v1 | Email bodies and web pages are data, never instructions; tools that read external content can't trigger sends in the same turn without confirmation. |
| Kill switch ("stop" cancels everything in flight) | v1 | |
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
| Calendar edit / reschedule / delete | v1 | Delete = confirm. |
| Gmail search + summarise ("anything from Amazon recruiting?") | v1 | Restricted scope → "unverified app" screen; fine for a personal app with you as test user. |
| Gmail draft reply | v1 | Safe — lands in Drafts. |
| Gmail send | v1 | Always confirm. |
| Auto-detect placement emails → update application cards | next | Biggest placement-season win; needs careful parsing. |
| Drive search + read docs | next | |
| Create Docs / Sheets | later | |

### 5. The web

| Item | Status | Notes |
| --- | --- | --- |
| Web search with sources | v1 | Gemini grounding with Google Search. |
| Read + summarise a URL | v1 | Server-side fetch. |
| Company research before an interview | v1 | Search + summarise into a note. |
| Act on logged-in sites (portals, forms) | later | Needs your browser session, high risk. v1 is read-only. |
| Track job postings / new openings | idea | |

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
