-- Nexus — initial schema (Phase 1)
-- Apply this in the Supabase SQL editor before starting the backend.

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Notes
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  embedding vector(768),
  source TEXT DEFAULT 'manual', -- 'manual' | 'chat' | 'voice'
  linked_event_id UUID,
  linked_task_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  status TEXT DEFAULT 'todo',     -- 'todo' | 'in_progress' | 'done'
  project_tag TEXT,
  parent_task_id UUID REFERENCES tasks(id),
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar events (synced from Google)
CREATE TABLE calendar_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  google_event_id TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  sms_reminder_sent BOOLEAN DEFAULT FALSE,
  reminder_minutes_before INT DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habits
CREATE TABLE habits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT DEFAULT 'daily',   -- 'daily' | 'weekly' | 'custom'
  target_days INT[] DEFAULT '{1,2,3,4,5,6,7}', -- ISO day numbers
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_checked_in DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE habit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  UNIQUE(habit_id, logged_date)
);

-- Goals
CREATE TABLE goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'personal', -- 'academic' | 'health' | 'personal' | 'career'
  target_date DATE,
  progress_pct INT DEFAULT 0,
  status TEXT DEFAULT 'active',     -- 'active' | 'paused' | 'completed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goal_milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  due_date DATE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ
);

-- Focus sessions
CREATE TABLE focus_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_tag TEXT,
  duration_minutes INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE
);

-- SMS job queue (audit log — actual scheduling via BullMQ)
CREATE TABLE sms_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'sent' | 'delivered' | 'failed' | 'cancelled'
  linked_type TEXT,               -- 'task' | 'event' | 'habit' | 'custom'
  linked_id UUID,
  bull_job_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (chat history + embeddings)
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly reviews
CREATE TABLE weekly_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  content_md TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User settings (extends auth.users)
CREATE TABLE user_settings (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  persona_name TEXT DEFAULT 'Nexus',
  persona_style TEXT DEFAULT 'friendly', -- 'formal' | 'friendly' | 'concise'
  focus_areas TEXT[] DEFAULT '{}',
  phone_number TEXT,
  whatsapp_number TEXT,
  sms_opt_in BOOLEAN DEFAULT TRUE,
  whatsapp_opt_in BOOLEAN DEFAULT FALSE,
  wake_up_time TIME DEFAULT '08:00',
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security: enable on every user-owned table
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS policy loop: each user touches only their own rows.
-- NOTE: user_settings is intentionally EXCLUDED here — it keys on `id`, not
-- `user_id`, so it gets its own policy below. (Including it here fails the whole
-- DO block with "column user_id does not exist".)
DO $$ DECLARE t TEXT; BEGIN FOR t IN SELECT unnest(ARRAY[
  'notes','tasks','calendar_events','habits','habit_logs',
  'goals','goal_milestones','focus_sessions','sms_jobs',
  'conversations','weekly_reviews'
]) LOOP
  EXECUTE format('CREATE POLICY "user_isolation" ON %I FOR ALL USING (auth.uid() = user_id)', t);
END LOOP; END $$;

-- user_settings references the user via its `id` column.
DROP POLICY IF EXISTS "user_isolation" ON user_settings;
CREATE POLICY "user_isolation" ON user_settings FOR ALL USING (auth.uid() = id);

-- Vector similarity search across notes + conversations
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
  ORDER BY similarity DESC
  LIMIT match_count;
END $$;

-- Performance indexes
CREATE INDEX ON notes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX ON conversations USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX ON tasks (user_id, status, due_date);
CREATE INDEX ON habit_logs (habit_id, logged_date);
CREATE INDEX ON sms_jobs (user_id, status, scheduled_at);
