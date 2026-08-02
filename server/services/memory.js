import { getEmbedding } from './gemini.js';
import { supabaseAdmin } from './supabase.js';

/**
 * Embed `content` and persist the vector to the given row.
 * Memory writes are best-effort — failures are logged but never thrown.
 */
export async function embedAndStore(userId, tableName, recordId, content) {
  try {
    const embedding = await getEmbedding(content);
    const { error } = await supabaseAdmin
      .from(tableName)
      .update({ embedding })
      .eq('id', recordId)
      .eq('user_id', userId);
    if (error) console.error('[memory] update failed:', tableName, recordId, error.message);
  } catch (err) {
    console.error('[memory] embedAndStore error:', err.message);
  }
}

/**
 * Semantic retrieval across notes + conversations via the match_documents RPC.
 * Returns [] on any failure so chat never crashes due to a memory miss.
 */
export async function retrieveMemory(userId, query, { threshold = 0.75, limit = 5 } = {}) {
  try {
    const queryEmbedding = await getEmbedding(query);
    const { data, error } = await supabaseAdmin.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      p_user_id: userId
    });
    if (error) {
      console.error('[memory] match_documents RPC failed:', error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error('[memory] retrieveMemory error:', err.message);
    return [];
  }
}

/**
 * Build the Gemini system prompt with persona + retrieved context.
 * Pass empty arrays for sections that have no data yet (Phase 1 events/habits).
 */
export function buildSystemPrompt({
  personaName = 'Nexus',
  personaStyle = 'friendly',
  memoryContext = [],
  todaysEvents = [],
  overdueTasks = [],
  todaysHabits = [],
  currentDateTime = new Date().toISOString()
} = {}) {
  const memoryLines = memoryContext.length
    ? memoryContext.map(m => `- [${m.source_table}] ${m.content}`).join('\n')
    : '(no relevant memories yet)';
  const eventsLines = todaysEvents.length
    ? todaysEvents.map(e => `- ${e.start_time}: ${e.title}`).join('\n')
    : '(none yet)';
  const overdueLines = overdueTasks.length
    ? overdueTasks.map(t => `- ${t.title} (due ${t.due_date})`).join('\n')
    : '(none)';
  const habitsLines = todaysHabits.length
    ? todaysHabits.map(h => `- ${h.name}`).join('\n')
    : '(none yet)';

  return `You are ${personaName}, a personal AI agent and second brain. Your communication style is ${personaStyle}.

The user's name is Rama. Today is ${currentDateTime}.

RELEVANT MEMORIES (from past conversations and notes):
${memoryLines}

UPCOMING EVENTS TODAY:
${eventsLines}

OVERDUE TASKS:
${overdueLines}

ACTIVE HABITS TODAY:
${habitsLines}

When the user asks you to remember, note, save, or store something — call create_note.
When the user mentions a task, deadline, or to-do — call create_task.
When the user wants a reminder at a specific time — call schedule_reminder.
When the user mentions scheduling a meeting or event — call create_calendar_event.
When the user asks what they said before or about a past topic — call search_memory.
When the user says they completed a habit — call log_habit.

Always confirm what you did. Be concise. Be helpful. Be personal.`;
}
