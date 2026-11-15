import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  isLoopback,
  secretMatches,
  hotkeyConfigured,
  subscribe,
  broadcast,
  listenerCount
} from '../services/hotkeyHub.js';

// Global push-to-talk (see services/hotkeyHub.js and tools/hotkey/).
const router = Router();

/** GET /api/hotkey/events — SSE stream for the signed-in Nexus tab (Authorization header, no token in the URL). */
router.get('/events', requireAuth, (req, res) => {
  if (!hotkeyConfigured()) return res.status(503).json({ error: 'HOTKEY_SECRET is not set in server/.env' });
  subscribe(req.user.id, res);
});

/** GET /api/hotkey/status → { configured, listeners } */
router.get('/status', requireAuth, (_req, res) => {
  res.json({ configured: hotkeyConfigured(), listeners: listenerCount() });
});

/**
 * POST /api/hotkey/down | /api/hotkey/up — called only by the tray helper.
 * Must come from this machine AND carry the shared secret: a press opens the mic.
 */
router.post('/:dir', (req, res) => {
  if (!['down', 'up'].includes(req.params.dir)) return res.status(404).json({ error: 'Unknown hotkey event' });
  if (!hotkeyConfigured()) return res.status(503).json({ error: 'HOTKEY_SECRET is not set' });
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).json({ error: 'Local only' });
  if (!secretMatches(req.get('x-nexus-hotkey'), process.env.HOTKEY_SECRET)) {
    return res.status(401).json({ error: 'Bad hotkey secret' });
  }
  res.json({ ok: true, delivered: broadcast(req.params.dir) });
});

export default router;
