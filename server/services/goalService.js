// Goal progress, shared by the goals route and the assistant's manage_goal tool.
import { supabaseAdmin } from './supabase.js';

/** Recompute a goal's progress_pct from its milestones (no-op if it has none). */
export async function recomputeProgress(userId, goalId) {
  const { data: ms } = await supabaseAdmin
    .from('goal_milestones')
    .select('completed')
    .eq('goal_id', goalId)
    .eq('user_id', userId);
  if (!ms || ms.length === 0) return;
  const done = ms.filter((m) => m.completed).length;
  const pct = Math.round((done / ms.length) * 100);
  await supabaseAdmin
    .from('goals')
    .update({ progress_pct: pct, status: pct === 100 ? 'completed' : 'active' })
    .eq('id', goalId)
    .eq('user_id', userId);
}
