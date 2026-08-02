import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { embedAndStore, retrieveMemory } from '../services/memory.js';

const router = Router();
router.use(requireAuth);

// GET /api/notes — list (with optional ?q=semantic-query or ?tag=foo)
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const { q, tag } = req.query;

  try {
    if (q && String(q).trim().length > 0) {
      const hits = await retrieveMemory(userId, String(q), { threshold: 0.5, limit: 20 });
      const noteHits = hits.filter(h => h.source_table === 'notes');
      if (!noteHits.length) return res.json({ notes: [], semantic: true });
      const ids = noteHits.map(h => h.id);
      const { data, error } = await supabaseAdmin
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .in('id', ids);
      if (error) throw error;
      // Re-order to match semantic ranking and attach similarity
      const byId = Object.fromEntries((data ?? []).map(n => [n.id, n]));
      const ordered = noteHits
        .map(h => byId[h.id] ? { ...byId[h.id], similarity: h.similarity } : null)
        .filter(Boolean);
      return res.json({ notes: ordered, semantic: true });
    }

    let query = supabaseAdmin
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (tag) query = query.contains('tags', [String(tag)]);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ notes: data ?? [], semantic: false });
  } catch (err) {
    console.error('[notes] list failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('notes')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ note: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notes
router.post('/', async (req, res) => {
  const { title = null, content, tags = [], source = 'manual' } = req.body ?? {};
  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('notes')
      .insert({ user_id: req.user.id, title, content, tags, source })
      .select('*')
      .single();
    if (error) throw error;
    setImmediate(() => embedAndStore(req.user.id, 'notes', data.id, content));
    res.status(201).json({ note: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notes/:id
router.patch('/:id', async (req, res) => {
  const patch = { ...req.body, updated_at: new Date().toISOString() };
  delete patch.id;
  delete patch.user_id;
  delete patch.embedding;
  try {
    const { data, error } = await supabaseAdmin
      .from('notes')
      .update(patch)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();
    if (error) throw error;
    if (typeof patch.content === 'string') {
      setImmediate(() => embedAndStore(req.user.id, 'notes', data.id, patch.content));
    }
    res.json({ note: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('notes')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
