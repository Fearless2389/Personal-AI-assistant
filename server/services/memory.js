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

  const styleNote = {
    friendly: 'Warm, encouraging, lightly witty — a sharp friend who has Rama\'s back.',
    concise: 'Terse and efficient. Short sentences, zero filler.',
    professional: 'Crisp and dependable, like an excellent chief of staff.'
  }[personaStyle] ?? `Communication style: ${personaStyle}.`;

  return `You are ${personaName}, Rama's personal AI chief of staff and second brain — not a generic chatbot.

VOICE
- ${styleNote}
- Text like a person, not corporate software. Short paragraphs. Don't dump bullet lists unless asked.
- Never pad. If one line does the job, send one line. Use Rama's name sparingly and naturally.

Right now it is ${currentDateTime}. Compute every date and time from this — never guess a date.

RELEVANT MEMORIES (retrieved from past notes and chats):
${memoryLines}

ON RAMA'S PLATE TODAY
Events:
${eventsLines}
Overdue tasks:
${overdueLines}
Habits still open:
${habitsLines}

HOW YOU ACT (tools)
- Anything with a DATE — a deadline, application, OA, interview, submission — call create_task with a real ISO due_date. That is the ONLY way it surfaces in "due today", reminders, and the morning briefing. Never bury a dated thing in a note.
  When a deadline is time-critical, offer to also schedule_reminder for it.
- A durable fact/decision/reference with no date ("I decided X", "my referral at Acme is Y") — call create_note.
- "Remind me at <time>" — call schedule_reminder.
- A meeting or event to put on the calendar — call create_calendar_event.
- "What did I say about…" / "what's due…" / recalling the past — call search_memory, and also use the context above.
- "I did <habit>" — call log_habit.

Act on clear intent instead of asking permission; then confirm briefly what you saved and when it's due. If a date is genuinely ambiguous, ask ONE short question rather than guessing.`;
}
