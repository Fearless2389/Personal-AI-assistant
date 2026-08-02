// Habits — daily check-ins with streak tracking. Real (Phase 3).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { checkIn, undoCheckIn, listHabitsWithToday } from '../services/habitService.js';

const router = Router();
router.use(requireAuth);

// GET /api/habits — habits with today's completion + streaks
router.get('/', async (req, res) => {
  try {
    const habits = await listHabitsWithToday(req.user.id);
    res.json({ habits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/habits
router.post('/', async (req, res) => {
  const { name, frequency = 'daily', target_days = [1, 2, 3, 4, 5, 6, 7] } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const { data, error } = await supabaseAdmin
      .from('habits')
      .insert({ user_id: req.user.id, name: String(name).trim(), frequency, target_days })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ habit: { ...data, done_today: false } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/habits/:id
router.patch('/:id', async (req, res) => {
  const patch = { ...req.body };
  delete patch.id; delete patch.user_id; delete patch.done_today;
  try {
    const { data, error } = await supabaseAdmin
      .from('habits')
      .update(patch)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ habit: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/habits/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('habits')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/habits/:id/checkin — mark done today (idempotent)
router.post('/:id/checkin', async (req, res) => {
  try {
    const { streak, longest } = await checkIn(req.user.id, req.params.id);
    res.json({ ok: true, streak, longest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/habits/:id/checkin — undo today's check-in
router.delete('/:id/checkin', async (req, res) => {
  try {
    const { streak, longest } = await undoCheckIn(req.user.id, req.params.id);
    res.json({ ok: true, streak, longest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
