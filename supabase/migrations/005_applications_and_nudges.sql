-- 005: placement/job application tracker + nudge snoozing
--
-- applications: one row per company+role you are pursuing. `next_step` +
--   `next_deadline` hold the single thing that's due next (OA, interview round,
--   form) so the briefing, Today view and nudges can query deadlines directly
--   instead of relying on fuzzy semantic recall. `stage_history` is an append-only
--   [{stage, at}] log for the card's timeline.
-- nudge_dismissals: "Nexus noticed" nudges are computed on the fly; this table
--   only remembers which ones the user dismissed or snoozed (keyed like
--   'stale:<application id>'). Safe to run more than once.

CREATE TABLE IF NOT EXISTS applications (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company          TEXT NOT NULL,
  role             TEXT,
  channel          TEXT NOT NULL DEFAULT 'off_campus'
                   CHECK (channel IN ('on_campus', 'off_campus')),
  stage            TEXT NOT NULL DEFAULT 'applied'
                   CHECK (stage IN ('wishlist', 'applied', 'oa', 'interview', 'offer', 'rejected', 'withdrawn')),
  next_step        TEXT,
  next_deadline    TIMESTAMPTZ,
  link             TEXT,
  source           TEXT,
  notes            TEXT,
  stage_history    JSONB NOT NULL DEFAULT '[]'::jsonb,
  applied_at       TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS applications_user_stage_idx    ON applications (user_id, stage);
CREATE INDEX IF NOT EXISTS applications_user_deadline_idx ON applications (user_id, next_deadline);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_isolation" ON applications;
CREATE POLICY "user_isolation" ON applications FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS nudge_dismissals (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nudge_key  TEXT NOT NULL,
  until      TIMESTAMPTZ,          -- NULL = dismissed for good; otherwise snoozed until then
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, nudge_key)
);

ALTER TABLE nudge_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_isolation" ON nudge_dismissals;
CREATE POLICY "user_isolation" ON nudge_dismissals FOR ALL USING (auth.uid() = user_id);
