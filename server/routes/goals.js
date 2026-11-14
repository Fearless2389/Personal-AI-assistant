// Goals + milestones. Progress auto-derives from milestone completion. Real (Phase 3).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { recomputeProgress } from '../services/goalService.js';

const router = Router();
router.use(requireAuth);

// GET /api/goals — goals with nested milestones
router.get('/', async (req, res) => {
  try {
    const { data: goals, error } = await supabaseAdmin
      .from('goals')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = (goals ?? []).map((g) => g.id);
    let byGoal = {};
    if (ids.length) {
      const { data: ms } = await supabaseAdmin
        .from('goal_milestones')
        .select('*')
        .eq('user_id', req.user.id)
        .in('goal_id', ids)
        .order('due_date', { ascending: true, nullsFirst: false });
      for (const m of ms ?? []) (byGoal[m.goal_id] ??= []).push(m);
    }
    res.json({ goals: (goals ?? []).map((g) => ({ ...g, milestones: byGoal[g.id] ?? [] })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/goals
router.post('/', async (req, res) => {
  const { title, description = null, category = 'personal', target_date = null } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
  try {
    const { data, error } = await supabaseAdmin
      .from('goals')
      .insert({ user_id: req.user.id, title: String(title).trim(), description, category, target_date })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ goal: { ...data, milestones: [] } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/goals/:id
router.patch('/:id', async (req, res) => {
  const patch = { ...req.body };
  delete patch.id;
  delete patch.user_id;
  delete patch.milestones;
  try {
    const { data, error } = await supabaseAdmin
      .from('goals')
      .update(patch)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ goal: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/goals/:id (milestones cascade via FK)
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('goals').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/goals/:id/milestones
router.post('/:id/milestones', async (req, res) => {
  const { title, due_date = null } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
  try {
    const { data, error } = await supabaseAdmin
      .from('goal_milestones')
      .insert({ goal_id: req.params.id, user_id: req.user.id, title: String(title).trim(), due_date })
      .select('*')
      .single();
    if (error) throw error;
    await recomputeProgress(req.user.id, req.params.id);
    res.status(201).json({ milestone: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/goals/:id/milestones/:mid — toggle completion or edit
router.patch('/:id/milestones/:mid', async (req, res) => {
  const patch = { ...req.body };
  delete patch.id;
  delete patch.user_id;
  delete patch.goal_id;
  if (patch.completed !== undefined) {
    patch.completed_at = patch.completed ? new Date().toISOString() : null;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('goal_milestones')
      .update(patch)
      .eq('id', req.params.mid)
      .eq('goal_id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();
    if (error) throw error;
    await recomputeProgress(req.user.id, req.params.id);
    res.json({ milestone: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/goals/:id/milestones/:mid
router.delete('/:id/milestones/:mid', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('goal_milestones')
      .delete()
      .eq('id', req.params.mid)
      .eq('goal_id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    await recomputeProgress(req.user.id, req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
