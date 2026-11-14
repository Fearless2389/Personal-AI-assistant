import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { getChatModel } from '../services/gemini.js';
import { embedAndStore, retrieveMemory, buildSystemPrompt } from '../services/memory.js';
import { handleToolCall, MEMORY_THRESHOLD } from '../services/tools.js';
import { loadAssistantContext } from '../services/assistantContext.js';
import { formatInTz } from '../services/time.js';

const router = Router();

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

    // 4) Persona, timezone, next 7 days and open habits for the system prompt
    const { settings, tz, upcoming, todaysHabits } = await loadAssistantContext(userId, { logTag: `chat:${req.id}` });

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
