import { supabaseAdmin } from './supabase.js';
import { listUpcoming } from './agenda.js';
import { listHabitsWithToday } from './habitService.js';
import { DEFAULT_TZ } from './time.js';

/**
 * Everything the assistant should know before the user says a word: persona,
 * timezone, the next 7 days of deadlines and today's open habits. Shared by
 * text chat and voice so both see the same world. Every part is best-effort —
 * a failed lookup degrades to an empty list, never a broken conversation.
 */
export async function loadAssistantContext(userId, { logTag = 'assistant' } = {}) {
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('persona_name, persona_style, google_connection_status, timezone')
    .eq('id', userId)
    .maybeSingle();
  const tz = settings?.timezone || DEFAULT_TZ;

  const [upcoming, todaysHabits] = await Promise.all([
    // Next 7 days of deadlines (tasks, application next-steps, events), overdue included
    listUpcoming(userId, {
      daysAhead: 7,
      tz,
      includeEvents: settings?.google_connection_status === 'connected'
    }).catch((err) => {
      console.warn(`[${logTag}] agenda fetch failed:`, err.message);
      return [];
    }),
    // Habits still pending today
    listHabitsWithToday(userId)
      .then((habits) => habits.filter((h) => !h.done_today).map((h) => ({ name: h.name })))
      .catch(() => [])
  ]);

  return { settings, tz, upcoming, todaysHabits };
}
