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

- **Chat tools** live in one dispatcher: `server/routes/chat.js` → `handleToolCall`; declarations in
  `services/gemini.js`. Nine tools: create_note, create_task, create_calendar_event,
  schedule_reminder, log_habit, search_memory, track_application, list_applications, list_upcoming.
  The chat loop chains up to `MAX_TOOL_ROUNDS` (3). New tool → add a summary in
  `client/src/lib/toolSummary.js` and refresh keys in `store/useRefreshStore.js`.
- **Dates are answered by query, not vectors.** `services/agenda.js` (`listUpcoming`) merges tasks,
  application next-steps and events; it feeds the chat system prompt, `list_upcoming` and the Today
  timeline. Placement deadlines live on `applications.next_deadline` — never duplicate them as tasks.
- **Nudges** (`services/nudges.js`) are computed per request, deterministically (no Gemini).
  Only dismissals are stored. Keys are situation-stable (`due:<id>:<deadline>`, `stale:<id>`).
- **Cross-page refresh:** after a mutation, `useRefreshStore.bump('applications', 'agenda', …)`;
  pages read `useRefreshKey(key)` in their fetch effect deps.
- **Today page duplication rule:** dated items render only in the timeline; deadline/overdue
  nudges attach to their row as actions; "Nexus noticed" shows only `follow_up` nudges.
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
- All "today / overdue / due tomorrow" bucketing goes through `services/time.js` with the user's
  `user_settings.timezone` (default `Asia/Kolkata`). Never use `setHours`/`toDateString` server-side.
- `.prettierrc` matches house style and a global hook runs Prettier on every edited file — that's
  expected. Formatting-only changes go in their own commit.
- Free-tier Supabase pauses after ~7 idle days → every DB call fails with `fetch failed` and the
  host stops resolving. Fix: dashboard → Restore project. Not a code bug.
- The client is dark-only: `:root { color-scheme: dark }` keeps native pickers legible.
- Client bundle is one ~750 KB chunk — fine for now; code-split later if it matters.

## Verify before claiming done

- `cd client && npm run build` (green), `cd server && node --check <file>` on changed files.
- Boot the server and `curl` the route (expect 401 without auth) to confirm wiring.
- Full browser verification needs real `.env` (Supabase + Gemini) — say so if you can't run it.
