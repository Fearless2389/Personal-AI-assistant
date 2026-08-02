import { supabaseAdmin } from '../services/supabase.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = { id: data.user.id, email: data.user.email };
    req.jwt = token;
    next();
  } catch (err) {
    console.error('[auth] verification failed:', err.message);
    res.status(401).json({ error: 'Authentication failed' });
  }
}
