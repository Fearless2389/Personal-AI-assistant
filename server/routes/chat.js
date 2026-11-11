import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { getChatModel } from '../services/gemini.js';
import { embedAndStore, retrieveMemory, buildSystemPrompt } from '../services/memory.js';
import * as calendarService from '../services/calendarService.js';
import { scheduleReminder } from '../services/reminderService.js';
import { logHabitByName, listHabitsWithToday } from '../services/habitService.js';
import { trackApplication, listApplications, summarize } from '../services/applicationService.js';
import { listUpcoming } from '../services/agenda.js';
import { DEFAULT_TZ, formatInTz } from '../services/time.js';

const router = Router();

// Cosine-similarity floor for semantic recall. gemini-embedding-001 scores real
// matches around 0.5–0.8, so 0.6 silently dropped valid hits (measured).
const MEMORY_THRESHOLD = 0.5;
// How many rounds of tool calls one message may chain (e.g. look up → then update).
const MAX_TOOL_ROUNDS = 3;

/** Turn raw Gemini/SDK failures into something a person can act on. */
function friendlyAiError(err) {
  const msg = String(err?.message ?? '');
  if (/429|quota|rate.?limit|resource.?exhausted/i.test(msg)) {
    return "Gemini's free quota is used up for the moment. Try again in a minute.";
  }
  if (/API key|permission|403|401/i.test(msg))
    return 'The Gemini API key was rejected. Check GEMINI_API_KEY in server/.env.';
  if (/fetch failed|ENOTFOUND|ECONNRESET|network/i.test(msg)) return "Couldn't reach Gemini. Check your connection.";
  return 'Something went wrong generating a reply. Try again.';
}

/**
 * Stream a single SSE event with the standard `data: <json>\n\n` framing.
 */
function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Tool dispatcher. Every handler returns a plain result object (never throws) so a
 * failing tool becomes something the model can explain instead of a broken stream.
 */
async function handleToolCall(name, args, userId, { tz = DEFAULT_TZ } = {}) {
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

/**
 * POST /api/chat
 * Body: { message: string, sessionId: string }
 * Streams SSE chunks: { type: 'text', delta } | { type: 'tool_result', name, result } |
 *                     { type: 'memory', items } | { type: 'done' } | { type: 'error', message }
 */
router.post('/', requireAuth, async (req, res) => {
  const { message, sessionId } = req.body ?? {};
  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId are required' });
  }
  const userId = req.user.id;

  // SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  try {
    // 1) Persist user message (embedding filled in later, async)
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('conversations')
      .insert({ user_id: userId, session_id: sessionId, role: 'user', content: message })
      .select('id')
      .single();
    if (userErr) throw userErr;

    // 2) Retrieve top-K relevant memories
    const memoryContext = await retrieveMemory(userId, message, { threshold: MEMORY_THRESHOLD, limit: 5 });
    if (memoryContext.length) sse(res, { type: 'memory', items: memoryContext });

    // 3) Load this session's recent history (exclude the just-inserted user row)
    const { data: history } = await supabaseAdmin
      .from('conversations')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .neq('id', userRow.id)
      .order('created_at', { ascending: true })
      .limit(20);

    // 4) Load persona + Google connection state from user_settings (defaults if missing)
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('persona_name, persona_style, google_connection_status, timezone')
      .eq('id', userId)
      .maybeSingle();
    const tz = settings?.timezone || DEFAULT_TZ;

    // 4b) Gather live context for the system prompt — all best-effort, all
    //     independently guarded so a single failure never breaks chat.
    const [upcoming, todaysHabits] = await Promise.all([
      // Next 7 days of deadlines (tasks, application next-steps, events), overdue included
      listUpcoming(userId, {
        daysAhead: 7,
        tz,
        includeEvents: settings?.google_connection_status === 'connected'
      }).catch((err) => {
        console.warn(`[chat:${req.id}] agenda fetch failed:`, err.message);
        return [];
      }),
      // Habits still pending today
      listHabitsWithToday(userId)
        .then((habits) => habits.filter((h) => !h.done_today).map((h) => ({ name: h.name })))
        .catch(() => [])
    ]);

    const systemInstruction = buildSystemPrompt({
      personaName: settings?.persona_name ?? 'Nexus',
      personaStyle: settings?.persona_style ?? 'friendly',
      memoryContext,
      upcoming,
      todaysHabits,
      tz,
      currentDateTime: formatInTz(tz)
    });

    const model = getChatModel(systemInstruction);

    // 5) Build Gemini contents: prior turns + the new user message
    let contents = [
      ...(history ?? []).map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    // 6) Generate → run any tool calls → feed results back → repeat, up to
    //    MAX_TOOL_ROUNDS, so one message can chain steps (look up, then update).
    let assistantText = '';
    for (let round = 0; ; round++) {
      const stream = await model.generateContentStream({ contents });
      for await (const chunk of stream.stream) {
        const t = chunk.text();
        if (t) {
          assistantText += t;
          sse(res, { type: 'text', delta: t });
        }
      }
      const final = await stream.response;
      const calls = (typeof final.functionCalls === 'function' ? final.functionCalls() : null) ?? [];
      if (!calls.length || round >= MAX_TOOL_ROUNDS) break;

      const responseParts = [];
      for (const call of calls) {
        const result = await handleToolCall(call.name, call.args ?? {}, userId, { tz });
        sse(res, { type: 'tool_result', name: call.name, args: call.args ?? {}, result });
        responseParts.push({ functionResponse: { name: call.name, response: { result } } });
      }
      contents = [
        ...contents,
        { role: 'model', parts: calls.map((c) => ({ functionCall: c })) },
        { role: 'user', parts: responseParts }
      ];
    }

    // 8) Done event, end response
    sse(res, { type: 'done' });
    res.end();

    // 9) Async: persist assistant message + embed both user/assistant rows
    setImmediate(async () => {
      try {
        if (!assistantText.trim()) {
          embedAndStore(userId, 'conversations', userRow.id, message);
          return;
        }
        const { data: aRow, error: aErr } = await supabaseAdmin
          .from('conversations')
          .insert({ user_id: userId, session_id: sessionId, role: 'assistant', content: assistantText })
          .select('id')
          .single();
        if (aErr) {
          console.error('[chat] assistant row insert failed:', aErr.message);
        } else {
          embedAndStore(userId, 'conversations', aRow.id, assistantText);
        }
        embedAndStore(userId, 'conversations', userRow.id, message);
      } catch (err) {
        console.error('[chat] post-stream persist failed:', err.message);
      }
    });
  } catch (err) {
    console.error('[chat] stream failed:', err);
    try {
      sse(res, { type: 'error', message: friendlyAiError(err) });
      res.end();
    } catch {
      /* connection already closed */
    }
  }
});

export default router;
