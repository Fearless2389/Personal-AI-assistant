# Nexus — Product Requirements Document

> Version 1.0 · Personal AI second-brain · Built solo by Rama

---

## 1. Vision

Nexus replaces the scatter of notes apps, to-do lists, calendars, habit trackers, and
reminder apps with **one conversational interface** backed by an AI that has long-term
memory. You talk to it in plain language — "remind me to email the professor tomorrow at
9", "what did I decide about the thesis structure?", "schedule lunch with Vamsi Friday
1pm" — and it routes each request to the right subsystem and remembers everything.

The product bet: the winning interface for personal productivity is **conversation +
memory**, not more screens to navigate. The dedicated pages (Notes, Tasks, Calendar,
Habits, Goals) exist to *see and confirm* what the AI did, not as the primary way in.

## 2. Goals & non-goals

**Goals**
- One chat that can create notes/tasks/events/reminders and recall anything via semantic memory.
- Zero running cost — every dependency has a usable free tier.
- Installable as a mobile app (PWA) with a native-feeling dark UI.
- Senior-engineer quality: secure token handling, graceful degradation, no dead ends.

**Non-goals (v1)**
- Multi-user / team features. Single-user, per-account isolation only.
- Two-way calendar sync (external → Nexus). We read live and create; we don't reconcile.
- Native iOS/Android apps. PWA only.
- Rich text / attachments in notes. Plain text + tags.

## 3. Users

Primary (and only) user: a CS student who lives across a laptop and an Android phone,
wants a single place to offload their brain, and won't pay for SaaS. Values speed, a
clean dark UI, and the assistant actually remembering context.

## 4. Tech stack & rationale

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite 8 | Modern, fast dev loop |
| Styling | Tailwind v4 (`@theme` tokens, dark-native) | One consistent dark design system, no config file |
| State | Zustand | Minimal global state |
| Animation | Framer Motion | Page transitions, micro-interactions |
| PWA | vite-plugin-pwa | Installable + offline shell |
| Backend | Node 24 + Express 5 (ESM, plain JS) | Thin HTTP layer; no TypeScript per constraint |
| DB | Supabase Postgres + pgvector | Free hosted Postgres; vectors for semantic memory; RLS for isolation |
| Auth | Supabase Auth (Google) | JWT verified on every backend request |
| AI | Gemini 2.0 Flash + text-embedding-004 | Free; function calling + structured output + 768-dim embeddings |
| Calendar | googleapis (Calendar API) | Read + create on primary calendar |
| SMS | Twilio REST via fetch (no SDK) | Optional reminders; in-process DB-poll scheduler (no Redis) |
| Voice | Web Speech API | Browser-native STT, no backend cost |

## 5. Architecture

- **Thin routes, smart services.** Express routes validate + delegate; all external API and
  DB logic lives in `server/services/`.
- **Chat = SSE streaming + two-pass function calling.** The model streams a reply; if it
  calls a tool (`create_note`, `create_task`, `create_calendar_event`, `schedule_reminder`,
  `log_habit`, `search_memory`), the server executes it, feeds the result back, and the
  model streams a natural confirmation.
- **AI workflows** (`server/services/workflows/`) are the framework-free pattern for
  multi-step AI features: gather context → one structured-output Gemini call → typed JSON,
  always with a deterministic fallback. Used by the Morning Briefing and Weekly Review.
- **Semantic memory.** Notes, chat messages, and Nexus-created calendar events are embedded
  (768-dim) and searched via the `match_documents` Postgres RPC.
- **Security.** Google tokens are AES-256-GCM encrypted at rest; OAuth uses PKCE + an
  HMAC-signed state cookie; every response carries a `X-Request-Id`.

## 6. Feature set (all shipped)

| Module | What it does |
|---|---|
| **Chat** | Streaming AI with memory + 6 tools; injects today's events, overdue tasks, pending habits into context |
| **Dashboard** | AI morning briefing (calendar + tasks) with fallback; stat tiles; today's schedule |
| **Notes** | CRUD, tags, semantic search, auto-embed |
| **Tasks** | CRUD, drag-and-drop Kanban (todo/in-progress/done), priorities, due dates |
| **Calendar** | Connect Google (OAuth); agenda of next 14 days; create events from chat |
| **Habits** | Daily check-ins, streaks (with a one-day grace), `log_habit` from chat |
| **Goals** | Goals + milestones; progress auto-derives from milestone completion |
| **Focus** | Pomodoro timer with SVG ring; logs sessions; today/week focus stats |
| **Weekly Review** | AI recap of the week (tasks/focus/habits/notes) → wins + next-week priorities |
| **Analytics** | 7-day bars (tasks/focus/habits), task-status split, totals |
| **Settings** | Persona, phone + SMS opt-in, wake time, calendar connect/disconnect, sign out |
| **Reminders (SMS)** | Schedule/list/cancel; DB-poll scheduler; inbound STOP/START handling |

## 7. Data model (Supabase)

`notes`, `tasks`, `calendar_events`, `habits`, `habit_logs`, `goals`, `goal_milestones`,
`focus_sessions`, `sms_jobs`, `conversations`, `weekly_reviews`, `user_settings`.
All have RLS (`auth.uid()` isolation). `notes`, `conversations`, `calendar_events` carry a
`vector(768)` embedding searched by `match_documents`.

Migrations: `001` (schema), `002` (calendar tokens), `003` (calendar embedding + SMS
robustness).

## 8. Security & privacy

- Per-user RLS on every table; the service-role key is server-only.
- Google OAuth: PKCE (S256) + HMAC-signed, httpOnly, path-scoped state cookie; tokens
  AES-256-GCM encrypted before storage; refresh-token rotation persisted; broken grants
  flip the connection to `broken` and prompt reconnect.
- SMS: opt-in required; inbound STOP unsubscribes; webhook signature validated when Twilio
  is configured.

## 9. Cost model

All free-tier: Supabase (free project), Gemini (free AI Studio quota), Google Calendar API
(free), Twilio (optional; trial credit). No Redis/queue infra — the SMS scheduler runs
in-process.

## 10. Future work

- User-timezone-aware date bucketing (currently server-local).
- Richer inbound-SMS intent ("snooze 10m", "done").
- Multi-calendar selection; two-way sync.
- Code-splitting the client bundle (currently one ~750 KB chunk).
- WhatsApp channel (sender implemented, unwired).
- Onboarding flow for first-run persona + phone setup.
