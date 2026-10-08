import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { getChatModel } from '../services/gemini.js';
import { embedAndStore, retrieveMemory, buildSystemPrompt } from '../services/memory.js';
import * as calendarService from '../services/calendarService.js';
import { scheduleReminder } from '../services/reminderService.js';
import { logHabitByName, listHabitsWithToday } from '../services/habitService.js';
import { DEFAULT_TZ, formatInTz } from '../services/time.js';

const router = Router();

/**
 * Stream a single SSE event with the standard `data: <json>\n\n` framing.
 */
function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Tool dispatcher. Phase 1 implements create_note / create_task / search_memory fully;
 * the other three return a graceful "ships later" message so chat never crashes.
 */
async function handleToolCall(name, args, userId) {
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
      const results = await retrieveMemory(userId, String(query ?? ''), { threshold: 0.6, limit: 5 });
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
    const memoryContext = await retrieveMemory(userId, message, { threshold: 0.6, limit: 5 });
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
    const nowIso = new Date().toISOString();
    const [todaysEvents, overdueTasks, todaysHabits] = await Promise.all([
      // Calendar (only if connected)
      (async () => {
        if (settings?.google_connection_status !== 'connected') return [];
        try {
          return await calendarService.listTodaysEvents(userId, tz);
        } catch (err) {
          console.warn(`[chat:${req.id}] events fetch failed:`, err.message);
          return [];
        }
      })(),
      // Overdue tasks
      (async () => {
        try {
          const { data } = await supabaseAdmin
            .from('tasks')
            .select('title, due_date')
            .eq('user_id', userId)
            .neq('status', 'done')
            .lt('due_date', nowIso)
            .order('due_date', { ascending: true })
            .limit(5);
          return data ?? [];
        } catch {
          return [];
        }
      })(),
      // Habits still pending today
      (async () => {
        try {
          const habits = await listHabitsWithToday(userId);
          return habits.filter((h) => !h.done_today).map((h) => ({ name: h.name }));
        } catch {
          return [];
        }
      })()
    ]);

    const systemInstruction = buildSystemPrompt({
      personaName: settings?.persona_name ?? 'Nexus',
      personaStyle: settings?.persona_style ?? 'friendly',
      memoryContext,
      todaysEvents,
      overdueTasks,
      todaysHabits,
      currentDateTime: formatInTz(tz)
    });

    const model = getChatModel(systemInstruction);

    // 5) Build Gemini contents: prior turns + the new user message
    const contents = [
      ...(history ?? []).map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    // 6) First pass: model decides whether to call tools or just answer
    let firstStream = await model.generateContentStream({ contents });
    let assistantText = '';
    for await (const chunk of firstStream.stream) {
      const t = chunk.text();
      if (t) {
        assistantText += t;
        sse(res, { type: 'text', delta: t });
      }
    }
    const firstFinal = await firstStream.response;
    const fnCalls = (typeof firstFinal.functionCalls === 'function' ? firstFinal.functionCalls() : null) ?? [];

    // 7) If the model invoked tools, execute them and run a follow-up turn
    //    so it can speak naturally about the result.
    if (fnCalls.length) {
      const fnResponseParts = [];
      for (const call of fnCalls) {
        const result = await handleToolCall(call.name, call.args ?? {}, userId);
        sse(res, { type: 'tool_result', name: call.name, args: call.args ?? {}, result });
        fnResponseParts.push({ functionResponse: { name: call.name, response: { result } } });
      }

      const followUpContents = [
        ...contents,
        { role: 'model', parts: fnCalls.map((c) => ({ functionCall: c })) },
        { role: 'user', parts: fnResponseParts }
      ];

      const secondStream = await model.generateContentStream({ contents: followUpContents });
      for await (const chunk of secondStream.stream) {
        const t = chunk.text();
        if (t) {
          assistantText += t;
          sse(res, { type: 'text', delta: t });
        }
      }
    }

    // 8) Done event, end response
    sse(res, { type: 'done' });
    res.end();

    // 9) Async: persist assistant message + embed both user/assistant rows
    setImmediate(async () => {
      try {
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
      sse(res, { type: 'error', message: err?.message ?? 'Internal error' });
      res.end();
    } catch {
      /* connection already closed */
    }
  }
});

export default router;
