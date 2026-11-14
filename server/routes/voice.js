import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { embedAndStore } from '../services/memory.js';
import { handleToolCall } from '../services/tools.js';
import { loadAssistantContext } from '../services/assistantContext.js';
import { buildVoiceInstruction, voiceSetup, mintVoiceToken, VOICE_TOOL_NAMES } from '../services/voice.js';
import { DEFAULT_TZ } from '../services/time.js';

const router = Router();
const MAX_TRANSCRIPT = 4000;

/**
 * POST /api/voice/session → { token, model, expiresAt }
 * A fresh single-use Live API token with this user's prompt + tools locked in.
 */
router.post('/session', requireAuth, async (req, res, next) => {
  try {
    const ctx = await loadAssistantContext(req.user.id, { logTag: `voice:${req.id}` });
    res.json(await mintVoiceToken(voiceSetup(buildVoiceInstruction(ctx))));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/voice/tool  { name, args } → tool result
 * The browser relays each Live API tool call here; the same dispatcher as chat runs it.
 */
router.post('/tool', requireAuth, async (req, res) => {
  const { name, args = {} } = req.body ?? {};
  if (!VOICE_TOOL_NAMES.has(name)) return res.status(400).json({ error: `Unknown tool: ${name}` });
  if (typeof args !== 'object' || Array.isArray(args)) return res.status(400).json({ error: 'args must be an object' });

  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('timezone')
    .eq('id', req.user.id)
    .maybeSingle();
  const result = await handleToolCall(name, args, req.user.id, { tz: settings?.timezone || DEFAULT_TZ });
  res.json({ result });
});

/**
 * POST /api/voice/turn  { sessionId, heard, said } → 204
 * Saves one spoken exchange to conversations so voice is part of long-term memory.
 */
router.post('/turn', requireAuth, async (req, res, next) => {
  const { sessionId, heard = '', said = '' } = req.body ?? {};
  const clean = (s) =>
    String(s ?? '')
      .trim()
      .slice(0, MAX_TRANSCRIPT);
  const rows = [
    { role: 'user', content: clean(heard) },
    { role: 'assistant', content: clean(said) }
  ].filter((r) => r.content);
  if (!sessionId || !String(sessionId).startsWith('voice-')) {
    return res.status(400).json({ error: 'sessionId must start with "voice-"' });
  }
  if (!rows.length) return res.status(204).end();

  try {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert(rows.map((r) => ({ ...r, user_id: req.user.id, session_id: sessionId })))
      .select('id, content');
    if (error) throw error;
    setImmediate(() => data.forEach((row) => embedAndStore(req.user.id, 'conversations', row.id, row.content)));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
