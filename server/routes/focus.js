// Focus sessions — Pomodoro logging + quick stats. Real (Phase 3).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();
router.use(requireAuth);

// POST /api/focus — log a session (usually a completed Pomodoro)
router.post('/', async (req, res) => {
  const { project_tag = null, duration_minutes, started_at, ended_at = null, completed = true } = req.body ?? {};
  if (!duration_minutes || !started_at) {
    return res.status(400).json({ error: 'duration_minutes and started_at are required' });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('focus_sessions')
      .insert({
        user_id: req.user.id,
        project_tag,
        duration_minutes,
        started_at,
        ended_at: ended_at ?? new Date().toISOString(),
        completed
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ session: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/focus — recent sessions
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('focus_sessions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ sessions: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/focus/stats — today + this-week totals
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startWeek = new Date(now);
    startWeek.setDate(now.getDate() - 6);
    startWeek.setHours(0, 0, 0, 0);

    const { data, error } = await supabaseAdmin
      .from('focus_sessions')
      .select('duration_minutes, started_at, completed')
      .eq('user_id', req.user.id)
      .gte('started_at', startWeek.toISOString());
    if (error) throw error;

    const rows = data ?? [];
    const todayMinutes = rows
      .filter((r) => new Date(r.started_at) >= startToday && r.completed)
      .reduce((a, r) => a + (r.duration_minutes ?? 0), 0);
    const weekMinutes = rows.filter((r) => r.completed).reduce((a, r) => a + (r.duration_minutes ?? 0), 0);
    const todaySessions = rows.filter((r) => new Date(r.started_at) >= startToday && r.completed).length;

    res.json({ todayMinutes, weekMinutes, todaySessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
