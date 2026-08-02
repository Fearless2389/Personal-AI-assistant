-- Nexus — Phase 2: Google Calendar token storage
-- Apply after 001_initial_schema.sql.
-- Idempotent: safe to re-run on a partially-applied database.

-- 1) Rename the expiry column to match the codebase convention (`*_at` for timestamptz).
--    We only rename when the old column exists and the new one does not, so re-running
--    this migration on a fully-applied database is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'user_settings' AND column_name = 'google_token_expiry'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'user_settings' AND column_name = 'google_token_expires_at'
  ) THEN
    ALTER TABLE user_settings
      RENAME COLUMN google_token_expiry TO google_token_expires_at;
  END IF;
END$$;

-- 2) Connection status drives both the UI banner and the chat system-prompt fetch.
--    Values: 'disconnected' | 'connected' | 'broken'
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS google_connection_status TEXT NOT NULL DEFAULT 'disconnected';

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ;

-- 3) Backfill: any row that already has a stored refresh token from a prior connect
--    should be marked connected so the user doesn't get prompted to re-consent.
UPDATE user_settings
   SET google_connection_status = 'connected'
 WHERE google_refresh_token IS NOT NULL
   AND google_connection_status = 'disconnected';

-- 4) Index for the hot path on every chat turn:
--      SELECT persona_name, persona_style, google_connection_status
--        FROM user_settings WHERE id = $1
CREATE INDEX IF NOT EXISTS user_settings_google_status_idx
  ON user_settings (id, google_connection_status);
