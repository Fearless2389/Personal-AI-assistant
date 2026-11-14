import { supabaseAdmin } from './supabase.js';
import { embedAndStore, retrieveMemory } from './memory.js';
import * as calendarService from './calendarService.js';
import { scheduleReminder } from './reminderService.js';
import { logHabitByName } from './habitService.js';
import { trackApplication, listApplications, summarize } from './applicationService.js';
import { listUpcoming } from './agenda.js';
import { DEFAULT_TZ, wallTimeToUtcIso } from './time.js';

// Shared by text chat (routes/chat.js) and voice (routes/voice.js): one dispatcher,
// one set of behaviours, whichever way the request arrived.

// Cosine-similarity floor for semantic recall. gemini-embedding-001 scores real
// matches around 0.5–0.8, so 0.6 silently dropped valid hits (measured).
export const MEMORY_THRESHOLD = 0.5;

// Every datetime argument across the tool declarations in services/gemini.js.
const DATETIME_ARGS = ['due_date', 'scheduled_at', 'start_time', 'end_time', 'next_deadline'];

/** Pin offset-less model datetimes ("…T17:00:00") to the user's timezone. */
function normalizeDates(args, tz) {
  const out = { ...(args ?? {}) };
  for (const key of DATETIME_ARGS) if (key in out) out[key] = wallTimeToUtcIso(out[key], tz);
  return out;
}

/**
 * Tool dispatcher. Every handler returns a plain result object (never throws) so a
 * failing tool becomes something the model can explain instead of a broken stream.
 */
export async function handleToolCall(name, rawArgs, userId, { tz = DEFAULT_TZ } = {}) {
  const args = normalizeDates(rawArgs, tz);
  try {
    if (name === 'create_note') {
      const { title = null, content, tags = [] } = args ?? {};
      const { data, error } = await supabaseAdmin
        .from('notes')
        .insert({ user_id: userId, title, content, tags, source: 'chat' })
        .select('id, title, content, tags, created_at')
        .single();
      if (error) throw error;
      // Fire-and-forget embedding write
      setImmediate(() => embedAndStore(userId, 'notes', data.id, content));
      return { ok: true, id: data.id, title: data.title, message: 'Note saved.' };
    }

    if (name === 'create_task') {
      const { title, description = null, due_date = null, priority = 'medium', project_tag = null } = args ?? {};
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .insert({ user_id: userId, title, description, due_date, priority, project_tag })
        .select('id, title, due_date, priority, status')
        .single();
      if (error) throw error;
      return { ok: true, id: data.id, title: data.title, message: 'Task created.' };
    }

    if (name === 'search_memory') {
      const { query } = args ?? {};
      const results = await retrieveMemory(userId, String(query ?? ''), { threshold: MEMORY_THRESHOLD, limit: 5 });
      return { ok: true, results };
    }

    if (name === 'schedule_reminder') {
      const { message, scheduled_at, linked_type = null, linked_id = null } = args ?? {};
      return await scheduleReminder(userId, { message, scheduled_at, linked_type, linked_id });
    }
    if (name === 'create_calendar_event') {
      const { title, start_time, end_time, description = null, location = null } = args ?? {};
      if (!title || !start_time || !end_time) {
        return { ok: false, message: 'title, start_time, end_time are required.' };
      }
      try {
        const idempotencyKey = `chat:${userId}:${Date.parse(start_time)}:${title}`;
        const created = await calendarService.createEvent(
          userId,
          { title, start_time, end_time, description, location },
          { idempotencyKey }
        );

        const { data: mirror, error: mirrorErr } = await supabaseAdmin
          .from('calendar_events')
          .insert({
            user_id: userId,
            google_event_id: created.google_event_id,
            title,
            description,
            start_time,
            end_time,
            location
          })
          .select('id')
          .single();
        if (mirrorErr) {
          console.error('[chat] calendar mirror insert failed:', mirrorErr.message);
        } else {
          const embedText =
            `Calendar event: ${title} on ${start_time}` +
            (location ? ` at ${location}` : '') +
            (description ? `. ${description}` : '');
          setImmediate(() => embedAndStore(userId, 'calendar_events', mirror.id, embedText));
        }

        return {
          ok: true,
          google_event_id: created.google_event_id,
          html_link: created.html_link,
          title,
          start_time,
          message: 'Event added to your Google Calendar.'
        };
      } catch (err) {
        if (err.message === 'connection_broken') {
          return { ok: false, error: 'Google Calendar connection expired — please reconnect on the Calendar page.' };
        }
        if (err.message === 'not_connected') {
          return { ok: false, error: 'Google Calendar is not connected — open the Calendar page and click Connect.' };
        }
        if (err.message === 'rate_limited') {
          return { ok: false, error: 'Google Calendar is rate-limiting us right now — try again in a few seconds.' };
        }
        console.error('[chat] create_calendar_event failed:', err);
        return { ok: false, error: err.message ?? 'Calendar insert failed' };
      }
    }
    if (name === 'log_habit') {
      const { habit_name } = args ?? {};
      const result = await logHabitByName(userId, habit_name);
      if (result.ok) {
        return {
          ok: true,
          habit: result.habit,
          streak: result.streak,
          message: `Logged "${result.habit}"${result.created ? ' (new habit)' : ''}. Streak: ${result.streak} day${result.streak === 1 ? '' : 's'}.`
        };
      }
      return result;
    }

    if (name === 'track_application') {
      return await trackApplication(userId, args ?? {});
    }

    if (name === 'list_applications') {
      const { stage, channel, active_only = true } = args ?? {};
      const apps = await listApplications(userId, { stage, channel, activeOnly: active_only !== false });
      return { ok: true, count: apps.length, applications: apps.map(summarize) };
    }

    if (name === 'list_upcoming') {
      const { days_ahead = 7, include_overdue = true } = args ?? {};
      const items = await listUpcoming(userId, { daysAhead: days_ahead, includeOverdue: include_overdue, tz });
      return { ok: true, timezone: tz, count: items.length, items };
    }

    return { ok: false, message: `Unknown tool: ${name}` };
  } catch (err) {
    console.error('[chat] tool', name, 'failed:', err.message);
    return { ok: false, error: err.message };
  }
}
