-- 008: browser agent tasks and their steps (PLAN.md T2.1 / chunk 2C)
--
-- browser_tasks: one row per web errand or research task Nexus runs in its own browser window.
--   Tasks run one at a time per user; others wait as 'queued' (PLAN.md D5). 'waiting_confirmation'
--   = a risky step is parked in action_log for a yes; 'waiting_user' = the agent asked a question.
--   `collected` holds research tables: [{ title, columns, rows, url }].
-- browser_steps: every step the agent proposed, with its risk (safe / confirm / never) and what
--   happened. Confirm steps link to their action_log row.
-- The server writes with the service role; the owner can read their own rows. Safe to run twice.

CREATE TABLE IF NOT EXISTS browser_tasks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  goal        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'errand' CHECK (kind IN ('errand', 'research')),
  start_url   TEXT,
  source      TEXT NOT NULL CHECK (source IN ('voice', 'chat', 'page')),
  status      TEXT NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued', 'running', 'waiting_confirmation', 'waiting_user', 'done', 'failed', 'stopped')),
  success     BOOLEAN,
  summary     TEXT,
  question    TEXT,
  collected   JSONB,
  steps_used  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS browser_steps (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id       UUID REFERENCES browser_tasks(id) ON DELETE CASCADE NOT NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  n             INT NOT NULL,
  action        TEXT NOT NULL,
  args          JSONB NOT NULL DEFAULT '{}'::jsonb,
  label         TEXT,
  target        TEXT,
  url           TEXT,
  risk          TEXT NOT NULL CHECK (risk IN ('safe', 'confirm', 'never')),
  status        TEXT NOT NULL CHECK (status IN ('done', 'failed', 'blocked', 'declined', 'waiting')),
  note          TEXT,
  action_log_id UUID,
  shot_path     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, n)
);

CREATE INDEX IF NOT EXISTS browser_tasks_user_idx ON browser_tasks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS browser_tasks_open_idx ON browser_tasks (user_id, status)
  WHERE status IN ('queued', 'running', 'waiting_confirmation', 'waiting_user');

ALTER TABLE browser_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_read" ON browser_tasks;
CREATE POLICY "owner_read" ON browser_tasks FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_read" ON browser_steps;
CREATE POLICY "owner_read" ON browser_steps FOR SELECT USING (auth.uid() = user_id);
