-- 007: undo for logged actions
--
-- When Nexus changes your own data (tasks, notes, habits, goals, applications, SMS
-- reminders), the gate stores how to reverse it in action_log.undo: the id it created,
-- or the row as it was before. "Undo that" (or the Undo button) applies it once and
-- marks the row 'undone'. Google Calendar, Gmail and opened websites are not undoable.
-- Safe to run more than once.

ALTER TABLE action_log ADD COLUMN IF NOT EXISTS undo JSONB;
ALTER TABLE action_log ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ;

ALTER TABLE action_log DROP CONSTRAINT IF EXISTS action_log_status_check;
ALTER TABLE action_log ADD CONSTRAINT action_log_status_check
  CHECK (status IN ('executed', 'failed', 'awaiting_confirmation', 'confirmed',
                    'cancelled', 'expired', 'blocked', 'undone'));
