import { supabaseAdmin } from './supabase.js';
import { embedAndStore, retrieveMemory } from './memory.js';
import * as calendarService from './calendarService.js';
import { scheduleReminder } from './reminderService.js';
import { MANAGE_HANDLERS, prepareAction as prepareManaged } from './manageTools.js';
import { GOOGLE_HANDLERS, prepareGoogleAction, googleErrorResult } from './googleTools.js';
import { trackApplication, listApplications, summarize } from './applicationService.js';
import { listUpcoming } from './agenda.js';
import { listRecentActions } from './actionLog.js';
import { DEFAULT_TZ, modelTimeToUtcIso } from './time.js';

// Shared by text chat (routes/chat.js) and voice (routes/voice.js): one dispatcher,
// one set of behaviours, whichever way the request arrived.

// Cosine-similarity floor for semantic recall. gemini-embedding-001 scores real
// matches around 0.5–0.8, so 0.6 silently dropped valid hits (measured).
export const MEMORY_THRESHOLD = 0.5;

// Every datetime argument across the tool declarations in services/gemini.js.
const DATETIME_ARGS = ['due_date', 'scheduled_at', 'start_time', 'end_time', 'next_deadline'];

/**
 * Pin the model's datetimes to the user's timezone ("…T17:00:00" or "…T17:00:00Z"
 * both mean 5 PM local). Run ONCE, where model output enters — actionGate.runGuarded —
 * never on stored args (they are already UTC and would shift again).
 */
export function normalizeDates(args, tz) {
  const out = { ...(args ?? {}) };
  for (const key of DATETIME_ARGS) if (key in out) out[key] = modelTimeToUtcIso(out[key], tz);
  return out;
}

/**
 * Tool dispatcher. Every handler returns a plain result object (never throws) so a
 * failing tool becomes something the model can explain instead of a broken stream.
 * `args` must already be normalized (normalizeDates) — call through actionGate.runGuarded.
 */
export async function handleToolCall(name, args, userId, { tz = DEFAULT_TZ } = {}) {
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
        return googleErrorResult(err, 'Google Calendar');
      }
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

    if (name === 'list_recent_actions') {
      const { limit = 10 } = args ?? {};
      const rows = await listRecentActions(userId, { limit: Math.min(Number(limit) || 10, 25) });
      return {
        ok: true,
        count: rows.length,
        actions: rows.map((r) => ({
          tool: r.tool,
          status: r.status,
          summary: r.summary,
          args: r.args,
          via: r.source,
          at: r.created_at
        }))
      };
    }

    const handler = MANAGE_HANDLERS[name] ?? GOOGLE_HANDLERS[name];
    if (handler) return await handler(userId, args ?? {}, { tz });

    return { ok: false, message: `Unknown tool: ${name}` };
  } catch (err) {
    console.error('[chat] tool', name, 'failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Gate hook: before a risky action is parked, resolve and pin what it will touch
 * (which task/event, which recipients) so the readback is exact.
 * → { args } | { result } to hand back instead of parking.
 */
export function prepareAction(name, args, userId) {
  if (GOOGLE_HANDLERS[name]) return prepareGoogleAction(name, args, userId);
  return prepareManaged(name, args, userId);
}
