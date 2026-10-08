-- 004: user timezone + daily briefing scheduling
--
-- Adds the user's IANA timezone (so "due today" and the morning briefing bucket
-- in THEIR local day, not the server's UTC) plus the daily-briefing schedule.
-- `last_briefing_on` is the tz-local date the scheduler last sent a briefing, used
-- to guarantee at-most-once-per-day delivery. Safe to run more than once.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS timezone         text     NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS briefing_enabled boolean  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS briefing_hour    smallint NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS last_briefing_on date;

-- Keep briefing_hour a valid hour-of-day.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_briefing_hour_range'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_briefing_hour_range
      CHECK (briefing_hour >= 0 AND briefing_hour <= 23);
  END IF;
END $$;
