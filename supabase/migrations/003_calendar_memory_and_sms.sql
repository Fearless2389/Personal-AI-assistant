-- Nexus — Phase 3/4: calendar memory recall + SMS scheduler robustness
-- Apply after 002_calendar_tokens.sql. Idempotent.

-- 1) Give calendar_events an embedding so Nexus-CREATED events are semantically
--    recallable ("what meetings did I schedule this week?"). Phase 2 wrote to this
--    column before it existed; this makes that mirror-embed actually work.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS embedding vector(768);
CREATE INDEX IF NOT EXISTS calendar_events_embedding_idx
  ON calendar_events USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- 2) SMS scheduler robustness — the in-process poller records attempts + errors.
ALTER TABLE sms_jobs ADD COLUMN IF NOT EXISTS attempts INT DEFAULT 0;
ALTER TABLE sms_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;

-- 3) Extend match_documents to also search calendar_events. Same signature, so the
--    RPC call site in services/memory.js is unchanged.
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 5,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, content TEXT, source_table TEXT, similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.content, 'notes'::TEXT,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM notes n
  WHERE n.user_id = p_user_id
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  UNION ALL
  SELECT c.id, c.content, 'conversation'::TEXT,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM conversations c
  WHERE c.user_id = p_user_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  UNION ALL
  SELECT ce.id, ce.title || COALESCE(' — ' || ce.description, ''), 'calendar_event'::TEXT,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM calendar_events ce
  WHERE ce.user_id = p_user_id
    AND ce.embedding IS NOT NULL
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END $$;
