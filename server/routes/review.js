// Weekly Review — AI-generated recap. Real (Phase 4).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { runWeeklyReview, getLatestReview } from '../services/workflows/weeklyReview.js';

const router = Router();
router.use(requireAuth);

// GET /api/review — most recent saved review (or null)
router.get('/', async (req, res) => {
  try {
    const review = await getLatestReview(req.user.id);
    res.json({ review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/review/generate — generate + persist this week's review
router.post('/generate', async (req, res) => {
  try {
    const userName = req.user.email ? req.user.email.split('@')[0] : undefined;
    const payload = await runWeeklyReview(req.user.id, { userName });
    res.json(payload);
  } catch (err) {
    console.error(`[review:${req.id}] generate failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
