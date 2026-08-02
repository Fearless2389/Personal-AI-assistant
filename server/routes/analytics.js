// Analytics — aggregated activity for the dashboard charts. Real (Phase 4).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();
router.use(requireAuth);

function dayStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /api/analytics — last-7-day series + totals + status split
router.get('/', async (req, res) => {
  const userId = req.user.id;
  try {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
    const startIso = start.toISOString();

    // Build the 7-day skeleton (oldest → newest).
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      days.push({ date: dayStr(d), tasksCompleted: 0, focusMinutes: 0, habitCheckins: 0 });
    }
    const idx = Object.fromEntries(days.map((d, i) => [d.date, i]));

    const [allTasks, focus, habitLogs, notesCount, habitsCount, goalsCount] = await Promise.all([
      supabaseAdmin.from('tasks').select('status, updated_at').eq('user_id', userId),
      supabaseAdmin.from('focus_sessions').select('duration_minutes, started_at, completed').eq('user_id', userId).gte('started_at', startIso),
      supabaseAdmin.from('habit_logs').select('logged_date').eq('user_id', userId).gte('logged_date', dayStr(start)),
      supabaseAdmin.from('notes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('habits').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('goals').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    ]);

    const tasks = allTasks.data ?? [];
    const statusSplit = { todo: 0, in_progress: 0, done: 0 };
    for (const t of tasks) {
      if (statusSplit[t.status] !== undefined) statusSplit[t.status]++;
      if (t.status === 'done' && t.updated_at) {
        const key = dayStr(new Date(t.updated_at));
        if (idx[key] !== undefined) days[idx[key]].tasksCompleted++;
      }
    }
    for (const f of focus.data ?? []) {
      if (!f.completed) continue;
      const key = dayStr(new Date(f.started_at));
      if (idx[key] !== undefined) days[idx[key]].focusMinutes += f.duration_minutes ?? 0;
    }
    for (const h of habitLogs.data ?? []) {
      const key = String(h.logged_date).slice(0, 10);
      if (idx[key] !== undefined) days[idx[key]].habitCheckins++;
    }

    res.json({
      days,
      statusSplit,
      totals: {
        notes: notesCount.count ?? 0,
        habits: habitsCount.count ?? 0,
        goals: goalsCount.count ?? 0,
        tasksOpen: statusSplit.todo + statusSplit.in_progress,
        focusMinutesWeek: days.reduce((a, d) => a + d.focusMinutes, 0),
        tasksDoneWeek: days.reduce((a, d) => a + d.tasksCompleted, 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
