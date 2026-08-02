// Dashboard — the app's home screen data. Currently powered by the
// morning-briefing workflow (calendar + tasks → AI summary). Real, not a stub.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { runMorningBriefing } from '../services/workflows/morningBriefing.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/dashboard?refresh=1
 * Returns { briefing, generated, stats, events, generatedAt }.
 * `?refresh=1` bypasses the 30-minute per-user cache and regenerates.
 */
router.get('/', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const payload = await runMorningBriefing(req.user.id, { email: req.user.email, force });
    res.json(payload);
  } catch (err) {
    console.error(`[dashboard:${req.id}] briefing failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
