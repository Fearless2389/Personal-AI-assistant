# CLAUDE.md — Nexus

Personal AI second-brain. Read `docs/PRD.md` for product intent, `SETUP.md` for how to run it.

## Conventions (match these)

- **Plain JavaScript, ESM everywhere.** No TypeScript. `import`/`export`, `"type": "module"`.
- **Free-tier only.** No paid infra. No Redis/queues — SMS uses an in-process DB-poll
  scheduler (`services/scheduler.js`). Prefer `fetch` over adding SDKs (see `sms.js`, `whatsapp.js`).
- **Thin routes, smart services.** Routes validate + delegate; external API + DB logic lives in
  `server/services/`. All routes use `requireAuth` and scope every query by `req.user.id`.
- **Dark-native UI.** Tailwind v4 `@theme` tokens (`surface-*`, `text-*`, `nexus-primary/secondary`).
  No `dark:` variants — compose from `components/ui/` primitives (Card, Button, Badge, Input, Modal).
- **No new npm deps** unless unavoidable. Current backend deps: supabase-js, googleapis, ulid, cookie.

## Key patterns

- **Chat tools** live in one dispatcher: `server/routes/chat.js` → `handleToolCall`. Six tools:
  create_note, create_task, create_calendar_event, schedule_reminder, log_habit, search_memory.
- **AI workflows** = the framework-free alternative to LangChain. One file per workflow in
  `server/services/workflows/`: gather context → `getStructuredModel(system, schema)` →
  `JSON.parse(result.response.text())` → typed object, **always with a deterministic fallback**.
  Examples: `morningBriefing.js`, `weeklyReview.js`.
- **SSE framing** is exactly `data: <json>\n\n`. Memory writes are fire-and-forget via `setImmediate`.
- **Semantic memory:** embed with `embedAndStore(userId, table, id, text)`; search via
  `retrieveMemory` → `match_documents` RPC (searches notes, conversations, calendar_events).
- **Google Calendar:** tokens AES-256-GCM encrypted (`crypto.js`); OAuth via PKCE + HMAC state
  cookie (`stateCookie.js`); all Google logic in `calendarService.js`; never leak tokens to the client.

## Gotchas

- `user_settings` keys on `id` (= `auth.uid()`), not `user_id`. RLS + queries use `id`.
- Adding an embeddable source? Add its `vector(768)` column AND extend `match_documents`
  (see migration `003` for the calendar_events precedent).
- Dates bucket in **server-local** time for now (documented tech debt; user-tz is future work).
- Client bundle is one ~750 KB chunk — fine for now; code-split later if it matters.

## Verify before claiming done

- `cd client && npm run build` (green), `cd server && node --check <file>` on changed files.
- Boot the server and `curl` the route (expect 401 without auth) to confirm wiring.
- Full browser verification needs real `.env` (Supabase + Gemini) — say so if you can't run it.
