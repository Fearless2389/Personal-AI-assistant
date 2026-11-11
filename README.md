# Nexus

A personal AI second-brain web app. One conversational interface that replaces notes,
tasks, calendar, habits, goals, focus, and reminders — backed by an AI with long-term
memory. Built solo by Rama on a strict free-tier-only stack.

> **Status:** Feature-complete v1. All modules are live (Chat, Dashboard, Notes, Tasks,
> Calendar, Habits, Goals, Focus, Weekly Review, Analytics, Settings, SMS reminders).
> SMS delivery and WhatsApp are optional and need your own Twilio/Meta keys.

**→ To run it, follow [`SETUP.md`](./SETUP.md).** · **Product spec: [`docs/PRD.md`](./docs/PRD.md).**

## What works

- **Chat** — streaming Gemini with memory + 6 tools (create note/task/event/reminder, log
  habit, search memory). Injects today's events, overdue tasks, and pending habits into context.
- **Dashboard** — AI morning briefing (calendar + tasks) with a deterministic fallback, stat
  tiles, today's schedule.
- **Notes** — CRUD, tags, semantic search, auto-embed.
- **Tasks** — CRUD, drag-and-drop Kanban, priorities, due dates.
- **Calendar** — Google OAuth (PKCE + encrypted tokens), 14-day agenda, create events from chat.
- **Habits** — daily check-ins, streaks, `log_habit` from chat.
- **Goals** — goals + milestones with auto-derived progress.
- **Focus** — Pomodoro timer with SVG ring + session stats.
- **Weekly Review** — AI recap of the week → wins + next-week priorities.
- **Analytics** — 7-day activity bars, task-status split, totals.
- **Settings** — persona, phone/SMS opt-in, wake time, calendar connection, sign out.
- **SMS reminders** — schedule/list/cancel; in-process scheduler (no Redis); STOP/START handling.
- **PWA** — installable, dark-native UI, mobile bottom-nav, voice input.

## Stack

- **Frontend:** React 19, Vite 8, Tailwind v4, React Router v7, Zustand, Framer Motion,
  date-fns, @dnd-kit, vite-plugin-pwa.
- **Backend:** Node 24, Express 5 (ESM), `@supabase/supabase-js`, `googleapis`, `ulid`, `cookie`.
- **Database:** Supabase Postgres + pgvector + RLS.
- **AI:** Gemini 2.0 Flash (chat + tools + structured output) + `text-embedding-004` (768-dim).
- **Voice:** Web Speech API. **SMS:** Twilio REST (fetch, no SDK), in-process DB-poll scheduler.

## Architecture at a glance

- Thin Express routes delegate to `server/services/`.
- Chat is **SSE streaming + two-pass function calling**.
- **AI workflows** (`server/services/workflows/`) are the framework-free pattern for
  multi-step AI features — gather context → one structured Gemini call → typed JSON, with a
  deterministic fallback. Used by the Morning Briefing and Weekly Review.
- Semantic memory via the `match_documents` Postgres RPC over pgvector.
- Google tokens AES-256-GCM encrypted; OAuth uses PKCE + HMAC-signed state cookie.

## Project layout

```
nexus/
├── SETUP.md                     — do this to run the app
├── docs/PRD.md                  — product requirements
├── supabase/migrations/         — 001 schema · 002 calendar tokens · 003 calendar memory + SMS
├── server/
│   ├── index.js                 — Express entry, mounts /api/*, starts SMS scheduler
│   ├── routes/                   — chat, dashboard, notes, tasks, calendar, habits, goals,
│   │                              focus, review, analytics, settings, reminders, webhooks
│   ├── services/                 — supabase, gemini, memory, calendarService, crypto,
│   │   │                          stateCookie, googleOAuth, eventCache, habitService,
│   │   │                          reminderService, sms, scheduler, whatsapp
│   │   └── workflows/            — morningBriefing, weeklyReview
│   └── middleware/               — auth, requestId, twilioSignature
└── client/src/
    ├── pages/                    — all 12 pages live
    ├── components/               — ui/ primitives, layout/ shell, shared/, calendar/
    ├── hooks/ · store/ · lib/    — auth, voice, streaming chat, calendar; Zustand stores; api client
```

## Quick smoke test (no login)

```bash
cd server && npm run dev
curl http://localhost:3001/api/health          # {"ok":true,...}
curl -i http://localhost:3001/api/dashboard     # 401 (auth required) — confirms wiring
```

## License

Personal project, not licensed for redistribution.
