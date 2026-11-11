// Agenda — the Today view's "next N days" timeline. Thin route over services/agenda.js.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { listUpcoming } from '../services/agenda.js';
import { DEFAULT_TZ } from '../services/time.js';

const router = Router();
router.use(requireAuth);

// GET /api/agenda?days=7
router.get('/', async (req, res) => {
  try {
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('timezone, google_connection_status')
      .eq('id', req.user.id)
      .maybeSingle();
    const tz = settings?.timezone || DEFAULT_TZ;
    const items = await listUpcoming(req.user.id, {
      daysAhead: req.query.days ?? 7,
      tz,
      includeEvents: settings?.google_connection_status === 'connected'
    });
    res.json({ items, timezone: tz });
  } catch (err) {
    console.error(`[agenda:${req.id}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
