import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolvePending, cancelAllPending, listRecentActions } from '../services/actionGate.js';
import { loadUserTz } from '../services/assistantContext.js';

// The action log and the on-screen side of the confirmation gate.
const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/actions?limit=20 → { actions } — newest first, for Settings. */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json({ actions: await listRecentActions(req.user.id, { limit: req.query.limit }) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/actions/:id/resolve { decision: 'confirm' | 'cancel' } → result. The tap is the decision. */
router.post('/:id/resolve', requireAuth, async (req, res, next) => {
  const { decision } = req.body ?? {};
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid action id' });
  if (!['confirm', 'cancel'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "confirm" or "cancel"' });
  }
  try {
    const result = await resolvePending(req.user.id, {
      id: req.params.id,
      decision,
      via: 'button',
      tz: await loadUserTz(req.user.id)
    });
    res.json({ result });
  } catch (err) {
    next(err);
  }
});

/** POST /api/actions/cancel-pending → { cancelled: [ids] } — the kill switch. */
router.post('/cancel-pending', requireAuth, async (req, res, next) => {
  try {
    res.json({ cancelled: await cancelAllPending(req.user.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
