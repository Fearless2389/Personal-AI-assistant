-- 009: let conversations keep voice turns.
--
-- Voice turns are saved with session ids like 'voice-<uuid>' (routes/voice.js), so their history is
-- told apart from chat. conversations.session_id was UUID since 001, so every voice insert failed
-- with 22P02 ("invalid input syntax for type uuid") and no voice conversation was ever saved or
-- embedded into memory. TEXT keeps chat's plain UUIDs as they are. Safe to run twice.

ALTER TABLE conversations ALTER COLUMN session_id TYPE TEXT USING session_id::text;
