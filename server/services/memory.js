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

// "Thu, 9 Oct, 6:00 PM" in the user's timezone — readable for the model and the user.
function whenLabel(iso, tz, allDay) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(allDay ? {} : { hour: 'numeric', minute: '2-digit', hour12: true })
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Build the Gemini system prompt with persona + retrieved context.
 * `upcoming` is the agenda.listUpcoming() output (tasks, application next-steps,
 * events) — empty arrays render as "(none)".
 */
export function buildSystemPrompt({
  personaName = 'Nexus',
  personaStyle = 'friendly',
  memoryContext = [],
  upcoming = [],
  todaysHabits = [],
  tz = 'Asia/Kolkata',
  currentDateTime = new Date().toISOString()
} = {}) {
  const memoryLines = memoryContext.length
    ? memoryContext.map((m) => `- [${m.source_table}] ${m.content}`).join('\n')
    : '(no relevant memories yet)';
  const upcomingLines = upcoming.length
    ? upcoming
        .slice(0, 15)
        .map(
          (i) =>
            `- ${i.overdue ? 'OVERDUE ' : ''}${whenLabel(i.at, tz, i.all_day)} [${i.kind}] ${i.title}` +
            (i.detail ? ` (${i.detail})` : '')
        )
        .join('\n')
    : '(nothing with a deadline)';
  const habitsLines = todaysHabits.length ? todaysHabits.map((h) => `- ${h.name}`).join('\n') : '(none)';

  const styleNote =
    {
      friendly: "Warm, encouraging, lightly witty — a sharp friend who has Rama's back.",
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

NEXT 7 DAYS (authoritative — straight from the database, overdue first):
${upcomingLines}

Habits still open today:
${habitsLines}

Rama is in placement season (on-campus drives + off-campus applications). Treat that as the default context.

HOW YOU ACT (tools)
- Anything about a job/internship/placement application — applied, OA received, interview scheduled, offer, rejection, or a company's deadline — call track_application. It updates the existing card if there is one, so use it for every status change. Put the dated next thing in next_step + next_deadline. Do NOT also create a task for it.
- Any other dated thing (assignment, exam, form, errand) — call create_task with a real ISO due_date. Never bury a dated thing in a note.
  When a deadline is time-critical, offer to also schedule_reminder for it.
- "What's due / coming up / this week" — answer from NEXT 7 DAYS above; for a wider window call list_upcoming.
- "Which companies / what's pending / where am I with X" — call list_applications (filter by stage or on/off-campus).
- A durable fact/decision/reference with no date ("I decided X", "my referral at Acme is Y") — call create_note.
- "What did I say about…" / recalling a past conversation or note — call search_memory.
- "Remind me at <time>" — call schedule_reminder.
- A meeting or event to put on the calendar — call create_calendar_event.
- "I did <habit>" — call log_habit.
- If track_application says the company is ambiguous, ask which role in one short line.

Act on clear intent instead of asking permission; then confirm briefly what you saved and when it's due. If a date is genuinely ambiguous, ask ONE short question rather than guessing.`;
}
