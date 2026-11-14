-- 006: action log + confirmation gate (Jarvis Phase 2)
--
-- action_log: one row per tool call Nexus makes on your behalf (voice or chat):
--   what it ran, with which arguments, how risky it is, what happened, and the
--   words that triggered it. Answers "what did you just do?" and backs the
--   recent-actions list in Settings.
-- The same row doubles as the confirmation record for risky tools: it is written
--   as 'awaiting_confirmation', and only an explicit yes (button or your own spoken
--   words) moves it to 'confirmed' → 'executed'. Writes go through the server's
--   service role; RLS lets you read only your own rows. Safe to run more than once.

CREATE TABLE IF NOT EXISTS action_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('voice', 'chat')),
  tool        TEXT NOT NULL,
  args        JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk        TEXT NOT NULL CHECK (risk IN ('safe', 'confirm', 'never')),
  status      TEXT NOT NULL
              CHECK (status IN ('executed', 'failed', 'awaiting_confirmation', 'confirmed',
                                'cancelled', 'expired', 'blocked')),
  summary     TEXT,
  result      JSONB,
  utterance   TEXT,
  session_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS action_log_user_created_idx ON action_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS action_log_pending_idx ON action_log (user_id)
  WHERE status = 'awaiting_confirmation';

ALTER TABLE action_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_read" ON action_log;
CREATE POLICY "owner_read" ON action_log FOR SELECT USING (auth.uid() = user_id);
