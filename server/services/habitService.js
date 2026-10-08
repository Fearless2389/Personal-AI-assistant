// Habit streak logic, shared by the habits route and the chat `log_habit` tool.
import { supabaseAdmin } from './supabase.js';

/** Local YYYY-MM-DD for a date (server timezone). */
export function dayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Current streak = consecutive days with a log ending today (or yesterday, so a
 * streak isn't "broken" just because you haven't checked in yet this morning).
 */
export function computeStreak(loggedDates) {
  const set = new Set(loggedDates.map((d) => String(d).slice(0, 10)));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!set.has(dayStr(cursor))) cursor.setDate(cursor.getDate() - 1); // grace: allow ending yesterday
  let streak = 0;
  while (set.has(dayStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function recomputeStreak(userId, habitId) {
  const { data: logs } = await supabaseAdmin
    .from('habit_logs')
    .select('logged_date')
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .order('logged_date', { ascending: false })
    .limit(400);
  const dates = (logs ?? []).map((l) => l.logged_date);
  const streak = computeStreak(dates);
  const { data: habit } = await supabaseAdmin.from('habits').select('longest_streak').eq('id', habitId).maybeSingle();
  const longest = Math.max(streak, habit?.longest_streak ?? 0);
  await supabaseAdmin
    .from('habits')
    .update({ current_streak: streak, longest_streak: longest, last_checked_in: dates[0] ?? null })
    .eq('id', habitId)
    .eq('user_id', userId);
  return { streak, longest };
}

/** Idempotent check-in for a given date (defaults to today). */
export async function checkIn(userId, habitId, { date = dayStr() } = {}) {
  const { error } = await supabaseAdmin
    .from('habit_logs')
    .upsert({ habit_id: habitId, user_id: userId, logged_date: date }, { onConflict: 'habit_id,logged_date' });
  if (error) throw error;
  return recomputeStreak(userId, habitId);
}

export async function undoCheckIn(userId, habitId, { date = dayStr() } = {}) {
  const { error } = await supabaseAdmin
    .from('habit_logs')
    .delete()
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .eq('logged_date', date);
  if (error) throw error;
  return recomputeStreak(userId, habitId);
}

/**
 * Used by the chat `log_habit` tool: find a habit by name (creating it if new),
 * then check it in for today.
 */
export async function logHabitByName(userId, habitName) {
  const name = String(habitName ?? '').trim();
  if (!name) return { ok: false, message: 'habit_name is required.' };

  let { data: habit } = await supabaseAdmin
    .from('habits')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', name)
    .maybeSingle();

  let created = false;
  if (!habit) {
    const { data: inserted, error } = await supabaseAdmin
      .from('habits')
      .insert({ user_id: userId, name })
      .select('id, name')
      .single();
    if (error) return { ok: false, error: error.message };
    habit = inserted;
    created = true;
  }

  const { streak } = await checkIn(userId, habit.id);
  return { ok: true, habit: habit.name, created, streak };
}

/** List habits with a `done_today` flag for the given date. */
export async function listHabitsWithToday(userId, date = dayStr()) {
  const { data: habits, error } = await supabaseAdmin
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const ids = (habits ?? []).map((h) => h.id);
  let doneSet = new Set();
  if (ids.length) {
    const { data: todays } = await supabaseAdmin
      .from('habit_logs')
      .select('habit_id')
      .eq('user_id', userId)
      .eq('logged_date', date)
      .in('habit_id', ids);
    doneSet = new Set((todays ?? []).map((l) => l.habit_id));
  }
  return (habits ?? []).map((h) => ({ ...h, done_today: doneSet.has(h.id) }));
}
