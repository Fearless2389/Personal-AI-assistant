// User settings — persona, phone, opt-ins, wake time. Never exposes Google tokens.
// Real (Phase 4).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();
router.use(requireAuth);

const SAFE_COLUMNS =
  'persona_name, persona_style, focus_areas, phone_number, whatsapp_number, ' +
  'sms_opt_in, whatsapp_opt_in, wake_up_time, google_connection_status, last_connected_at, ' +
  'timezone, briefing_enabled, briefing_hour, last_briefing_on';

// Fields the client is allowed to change (tokens/status/last_briefing_on are managed elsewhere).
const EDITABLE = new Set([
  'persona_name', 'persona_style', 'focus_areas',
  'phone_number', 'whatsapp_number', 'sms_opt_in', 'whatsapp_opt_in', 'wake_up_time',
  'timezone', 'briefing_enabled', 'briefing_hour'
]);

// GET /api/settings — ensures a row exists, returns non-sensitive fields
router.get('/', async (req, res) => {
  try {
    let { data } = await supabaseAdmin
      .from('user_settings')
      .select(SAFE_COLUMNS)
      .eq('id', req.user.id)
      .maybeSingle();

    if (!data) {
      const { data: created, error } = await supabaseAdmin
        .from('user_settings')
        .insert({ id: req.user.id })
        .select(SAFE_COLUMNS)
        .single();
      if (error) throw error;
      data = created;
    }
    res.json({ settings: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings — whitelist-filtered update
router.patch('/', async (req, res) => {
  const patch = {};
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (EDITABLE.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No editable fields provided' });
  }
  patch.updated_at = new Date().toISOString();
  try {
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .upsert({ id: req.user.id, ...patch }, { onConflict: 'id' })
      .select(SAFE_COLUMNS)
      .single();
    if (error) throw error;
    res.json({ settings: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
