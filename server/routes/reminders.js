// Reminders — schedule / list / cancel SMS reminders. Real (Phase 3).
// Delivery is handled by the in-process scheduler (services/scheduler.js).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { scheduleReminder } from '../services/reminderService.js';

const router = Router();
router.use(requireAuth);

// GET /api/reminders — this user's reminders (newest first)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('sms_jobs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('scheduled_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json({ reminders: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reminders — schedule one
router.post('/', async (req, res) => {
  try {
    const result = await scheduleReminder(req.user.id, req.body ?? {});
    if (!result.ok) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reminders/:id — cancel a pending reminder
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('sms_jobs')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Reminder not found or already sent' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
