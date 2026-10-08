import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();
router.use(requireAuth);

// GET /api/tasks
router.get('/', async (req, res) => {
  const { status, project } = req.query;
  try {
    let q = supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('user_id', req.user.id)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (status) q = q.eq('status', String(status));
    if (project) q = q.eq('project_tag', String(project));
    const { data, error } = await q;
    if (error) throw error;
    res.json({ tasks: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ task: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  const {
    title,
    description = null,
    due_date = null,
    priority = 'medium',
    status = 'todo',
    project_tag = null,
    parent_task_id = null
  } = req.body ?? {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        user_id: req.user.id,
        title,
        description,
        due_date,
        priority,
        status,
        project_tag,
        parent_task_id
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ task: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tasks/:id
router.patch('/:id', async (req, res) => {
  const patch = { ...req.body, updated_at: new Date().toISOString() };
  delete patch.id;
  delete patch.user_id;
  try {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(patch)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ task: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('tasks').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
