# Nexus

A personal AI second-brain web app. One conversational interface that replaces notes,
tasks, calendar, habits, goals, focus, and reminders — backed by an AI with long-term
memory. Built solo by Rama on a strict free-tier-only stack.

> **Status:** v1.1 — built around placement season. All modules are live (Today, Applications,
> Chat, Notes, Tasks, Calendar, Habits, Goals, Focus, Weekly Review, Analytics, Settings, SMS
> reminders). SMS delivery and WhatsApp are optional and need your own Twilio/Meta keys.

**→ To run it, follow [`SETUP.md`](./SETUP.md).** · **Product spec: [`docs/PRD.md`](./docs/PRD.md).**

## What works

- **⌘K capture** — "tell Nexus anything" from any page. One sentence ("Applied to Uber, OA
  Friday 6pm") becomes the right card/task/event; each action comes back as a confirmation chip.
- **Today** — command centre: AI read on the day, a next-7-days timeline (tasks, application
  deadlines, events — overdue first, live countdowns, "now" marker), pipeline funnel, habits.
- **Applications** — placement tracker: drag-and-drop stage board (Wishlist → Applied → OA →
  Interview → Offer), on/off-campus filter, detail drawer with stage history. Chat updates
  cards in place ("got the Google OA" moves the existing card).
- **Nexus noticed** — deterministic nudges (no AI quota): deadlines within 48h, passed steps,
  applications quiet for 10+ days, evening "due tomorrow". Dismiss or snooze.
- **Chat** — streaming Gemini with memory + 9 tools, chaining up to 3 tool rounds per
  message. Every turn sees the next 7 days of deadlines straight from the database.
- **Morning briefing** — timezone-correct, prioritises placement deadlines; scheduler pass
  generates it daily at your chosen hour (delivery channel pluggable — SMS/WhatsApp when configured).
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
- **AI:** `gemini-flash-latest` (chat + tools + structured output) + `gemini-embedding-001`
  pinned to 768 dims.
- **Voice:** Web Speech API. **SMS:** Twilio REST (fetch, no SDK), in-process DB-poll scheduler.

## Architecture at a glance

- Thin Express routes delegate to `server/services/`.
- Chat is **SSE streaming + a bounded tool loop** (up to 3 rounds).
- **Dates are answered by query, not vectors:** `services/agenda.js` merges tasks, application
  next-steps and calendar events; semantic search is reserved for "what did I say about X".
- All "today/overdue" bucketing uses the user's timezone (`services/time.js`, Intl, no deps).
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
│                                  · 004 timezone + briefing · 005 applications + nudges
├── server/
│   ├── index.js                 — Express entry, mounts /api/*, starts the scheduler
│   ├── routes/                   — chat, dashboard, agenda, applications, nudges, notes, tasks,
│   │                              calendar, habits, goals, focus, review, analytics, settings,
│   │                              reminders, webhooks
│   ├── services/                 — supabase, gemini, memory, time, agenda, applicationService,
│   │   │                          nudges, briefingDelivery, calendarService, crypto, stateCookie,
│   │   │                          googleOAuth, eventCache, habitService, reminderService, sms,
│   │   │                          scheduler, whatsapp
│   │   └── workflows/            — morningBriefing, weeklyReview
│   └── middleware/               — auth, requestId, twilioSignature
└── client/src/
    ├── pages/                    — all 13 pages live (Today + Applications new in v1.1)
    ├── components/               — ui/ primitives, layout/ shell, shared/, calendar/,
    │                              applications/, today/, capture/ (⌘K bar)
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
