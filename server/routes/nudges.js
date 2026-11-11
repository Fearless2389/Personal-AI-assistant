// Nudges — the "Nexus noticed" feed. Thin route over services/nudges.js.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { computeNudges, dismissNudge } from '../services/nudges.js';
import { DEFAULT_TZ } from '../services/time.js';

const router = Router();
router.use(requireAuth);

// GET /api/nudges
router.get('/', async (req, res) => {
  try {
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('timezone')
      .eq('id', req.user.id)
      .maybeSingle();
    const nudges = await computeNudges(req.user.id, { tz: settings?.timezone || DEFAULT_TZ });
    res.json({ nudges });
  } catch (err) {
    console.error(`[nudges:${req.id}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/nudges/dismiss  { key, snooze_hours? }
router.post('/dismiss', async (req, res) => {
  try {
    const { key, snooze_hours } = req.body ?? {};
    await dismissNudge(req.user.id, key, { snoozeHours: snooze_hours });
    res.status(204).end();
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export default router;
