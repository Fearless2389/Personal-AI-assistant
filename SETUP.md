# Nexus — Setup Guide (your to-do list)

Everything you need to do to get Nexus running. **Nothing runs until you complete
sections 1–5** (they create the accounts + secrets the app needs). Sections 6–7 are
optional (SMS, WhatsApp).

Estimated time for the required parts: **~25–35 minutes**, mostly clicking through
Supabase and Google Cloud consoles.

---

## 0. Prerequisites

- Node 20+ (built/tested on Node 24) — check with `node -v`.
- The repo already has dependencies installed. If not: `cd server && npm install` then
  `cd ../client && npm install`.

---

## 1. Supabase (database + auth) — REQUIRED

1. Create a free project at <https://supabase.com>. Pick a region near you.
2. Wait for it to provision (~2 min).
3. **Run the migrations** — SQL Editor → New query → paste and run each, in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_calendar_tokens.sql`
   - `supabase/migrations/003_calendar_memory_and_sms.sql`
   - `supabase/migrations/004_briefing_and_tz.sql` — your timezone + daily briefing schedule
   - `supabase/migrations/005_applications_and_nudges.sql` — placement tracker + nudge snoozes
   - `supabase/migrations/006_action_log.sql` — what Nexus did + the confirmation gate
   - `supabase/migrations/007_action_undo.sql` — undo for actions on your own data
   - `supabase/migrations/008_browser_tasks.sql` — browser-agent tasks and steps (only needed for the browser agent)

   > **Free-tier gotcha:** Supabase pauses a project after ~7 days with no activity. If the app
   > suddenly can't log in and the server logs `fetch failed`, open the dashboard and click
   > **Restore project**. Keeping the server running prevents it (its scheduler queries every 30s).

4. **Get your keys** — Settings → API. You'll copy three values in section 4:
   - Project URL
   - `anon` public key
   - `service_role` secret key (⚠️ server-only, never in the client)

## 2. Google sign-in + Calendar (one OAuth client covers both) — REQUIRED

1. Go to <https://console.cloud.google.com> → create a project.
2. **APIs & Services → Library → enable "Google Calendar API".**
3. **OAuth consent screen** → External → fill app name + your email. Under **Scopes**, add:
   - `.../auth/calendar.events`
   - `.../auth/calendar.readonly`
     Under **Test users**, add your own Gmail (required while the app is "Testing").
4. **Credentials → Create Credentials → OAuth client ID → Web application.** Add **Authorized
   redirect URIs**:
   - `http://localhost:3001/api/calendar/callback` ← Nexus Calendar
   - the redirect URI Supabase shows you in the next step ← Google sign-in
5. Copy the **Client ID** and **Client secret** (used in sections 3 + 4).

## 3. Enable Google sign-in in Supabase — REQUIRED

1. Supabase → Authentication → Providers → **Google** → enable.
2. Paste the Client ID + secret from section 2.
3. Copy the **Redirect URL** Supabase displays and add it to your Google OAuth client's
   Authorized redirect URIs (section 2, step 4).

## 4. Gemini API key — REQUIRED

1. Go to <https://aistudio.google.com/app/apikey> → Create API key. Free tier is plenty.

## 5. Create the `.env` files — REQUIRED

Copy `.env.example` to two real files and fill them in.

```bash
cp .env.example server/.env
cp .env.example client/.env
```

**Generate the two Nexus secrets** (paste the output into `server/.env`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → NEXUS_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"       # → NEXUS_STATE_HMAC_SECRET
```

**`server/.env`** — required values:

```
SUPABASE_URL=...                 # section 1
SUPABASE_ANON_KEY=...            # section 1
SUPABASE_SERVICE_ROLE_KEY=...    # section 1
GEMINI_API_KEY=...               # section 4
NEXUS_ENCRYPTION_KEY=...         # generated above
NEXUS_STATE_HMAC_SECRET=...      # generated above
GOOGLE_CLIENT_ID=...             # section 2
GOOGLE_CLIENT_SECRET=...         # section 2
GOOGLE_REDIRECT_URI=http://localhost:3001/api/calendar/callback
CLIENT_ORIGIN=http://localhost:5173
PORT=3001
```

Optional:

```
TAVILY_API_KEY=...               # real web search (free ~1,000/month at tavily.com); without it, Wikipedia only
HOTKEY_SECRET=...                # any long random value; enables the global Alt+Space tray helper
OWNER_CONTEXT="..."              # your situation in a sentence or two (job, studies, focus); the assistant assumes it
GEMINI_CHAT_MODEL=gemini-flash-latest              # chat model (default)
GEMINI_CHAT_FALLBACK_MODEL=gemini-flash-lite-latest # used when the first one hangs or is overloaded
```

Browser agent (optional, in development: see `PLAN.md`). Nexus drives its own Chromium window
(separate profile in `server/.agent-profile`, gitignored) to do web errands, asking before anything that
buys, submits, sends or books. Needs migration 008 and, once, `cd server; npx playwright-core install chromium`.

```
BROWSER_AGENT_ENABLED=1          # adds /api/browser + the browse_web / browser_status / stop / answer tools
BROWSER_HEADLESS=0               # 1 hides the agent window (evals); 0 lets you watch it
BROWSER_STEP_INTERVAL_MS=5000    # pause between model calls (free-tier rate limits)
BROWSER_AGENT_MODEL=             # optional model to try first for the agent (default: the chat models)
BROWSER_PROFILE_DIR=             # optional; default server/.agent-profile
# BROWSER_AGENT_ALLOW_ORIGINS=http://127.0.0.1:3999   # TESTING ONLY: lets the agent open the local fixture site
```

Try it without the app: `cd server; npm run agent -- "Find the cheapest laptop and add it to the cart" --start http://127.0.0.1:3999/`
(starts the fixture shop itself). Evals: `npm run agent:eval` and `npm run agent:eval -- --suite redteam`
(results in `docs/agent-evals.md`). Sign in to a site by hand in the agent window: Nexus never types passwords.

Global push-to-talk (Windows): with the server running, `cd server; npm run hotkey`. A tray icon
appears; hold Alt+Space anywhere to talk to the open Nexus tab (click the tab once after
loading it — browsers require that before audio can play).
While it runs, Alt+Space no longer opens Windows' window menu (quit the helper to get that back).
If it says Alt+Space is taken, another app has it (PowerToys Run and the ChatGPT app use it by default):
change that app's shortcut. Without the helper, Alt+Space does nothing in Nexus (Windows keeps it);
hold the mic orb instead.

**`client/.env`**:

```
VITE_SUPABASE_URL=...            # same Project URL as server
VITE_SUPABASE_ANON_KEY=...       # same anon key as server
VITE_API_BASE_URL=http://localhost:3001
```

## 6. Run it

Two terminals:

```bash
# terminal 1
cd server && npm run dev      # → http://localhost:3001

# terminal 2
cd client && npm run dev      # → http://localhost:5173
```

Open <http://localhost:5173>, sign in with Google, land on `/chat`. Go to **Calendar** →
Connect Google Calendar to enable event features.

**Smoke test without logging in:**

```bash
curl http://localhost:3001/api/health        # {"ok":true,...}
```

---

## 7. SMS reminders (OPTIONAL)

Reminders work without this — they just queue as `pending` until Twilio is configured, then
the in-process scheduler sends them. To enable delivery:

1. Create a free trial account at <https://twilio.com>. Get a phone number.
2. Add to `server/.env`:
   ```
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=+1...
   ```
3. In Nexus → **Settings**, add your phone number and keep "Allow SMS reminders" on.
4. (Inbound replies, optional) Expose the server over HTTPS (e.g. `ngrok http 3001`), set
   `PUBLIC_BASE_URL` in `server/.env` to that HTTPS URL, and point your Twilio number's
   "A message comes in" webhook at `POST {PUBLIC_BASE_URL}/api/webhooks/twilio`.

> Trial Twilio only texts **verified** numbers. Verify your own number in the Twilio console.

## 8. WhatsApp (OPTIONAL, Phase 5)

The sender (`server/services/whatsapp.js`) is implemented but unwired. It needs a Meta
Business app + phone number ID (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`). Skip unless
you specifically want the WhatsApp channel.

---

## Troubleshooting

- **`supabaseUrl is required` / DB calls fail** — `server/.env` missing or unread. The server
  still boots (with a warning); fill in the Supabase values.
- **Sign-in works but `/chat` 401s** — `CLIENT_ORIGIN` (server) must exactly match the
  frontend URL (scheme + port), and `VITE_API_BASE_URL` must point at the server.
- **Calendar connect fails** — the redirect URI in Google Cloud must be character-for-character
  `http://localhost:3001/api/calendar/callback`.
- **Chat doesn't stream** — check `GEMINI_API_KEY` is set; the `/api/chat` response should be
  `text/event-stream`.
- **Semantic search finds nothing** — embeddings are written async; wait ~2s after creating a
  note. Confirm migration `003` ran (calendar recall depends on it).
