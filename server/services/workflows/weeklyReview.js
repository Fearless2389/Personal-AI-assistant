// ─────────────────────────────────────────────────────────────────────────────
//  Weekly-review workflow — the second AI workflow, same shape as morningBriefing:
//  gather a week of activity → reason with one structured Gemini call → typed JSON,
//  with a deterministic fallback. Persists a markdown copy to `weekly_reviews`.
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../supabase.js';
import { getStructuredModel } from '../gemini.js';

const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING', description: 'One-line summary of the week.' },
    summary: { type: 'STRING', description: '2-3 sentence reflective narrative.' },
    wins: { type: 'ARRAY', items: { type: 'STRING' }, description: 'What went well.' },
    watch: { type: 'ARRAY', items: { type: 'STRING' }, description: 'What slipped or needs attention.' },
    priorities: {
      type: 'ARRAY',
      description: 'Top 3 priorities for next week.',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, reason: { type: 'STRING' } },
        required: ['title', 'reason']
      }
    }
  },
  required: ['headline', 'summary', 'wins', 'priorities']
};

function startOfWeek(now = new Date()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function gather(userId) {
  const weekStart = startOfWeek();
  const sinceIso = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const [tasksDone, focus, habitLogs, notes] = await Promise.all([
    supabaseAdmin
      .from('tasks')
      .select('title, updated_at, status')
      .eq('user_id', userId)
      .eq('status', 'done')
      .gte('updated_at', sinceIso),
    supabaseAdmin
      .from('focus_sessions')
      .select('duration_minutes, completed, started_at')
      .eq('user_id', userId)
      .gte('started_at', sinceIso),
    supabaseAdmin
      .from('habit_logs')
      .select('logged_date, habit_id')
      .eq('user_id', userId)
      .gte('logged_date', dayStr(new Date(Date.now() - 7 * 24 * 3600_000))),
    supabaseAdmin.from('notes').select('title, created_at').eq('user_id', userId).gte('created_at', sinceIso)
  ]);

  const focusRows = focus.data ?? [];
  return {
    weekStart,
    completedTasks: (tasksDone.data ?? []).map((t) => t.title),
    focusMinutes: focusRows.filter((f) => f.completed).reduce((a, f) => a + (f.duration_minutes ?? 0), 0),
    focusSessions: focusRows.filter((f) => f.completed).length,
    habitCheckins: (habitLogs.data ?? []).length,
    notesCreated: (notes.data ?? []).length
  };
}

function renderContext(c) {
  const tasks = c.completedTasks.length ? c.completedTasks.map((t) => `- ${t}`).join('\n') : '(none marked done)';
  return `Week of ${c.weekStart.toDateString()}

COMPLETED TASKS (${c.completedTasks.length}):
${tasks}

FOCUS: ${c.focusMinutes} minutes across ${c.focusSessions} sessions
HABIT CHECK-INS: ${c.habitCheckins}
NOTES CREATED: ${c.notesCreated}`;
}

function toMarkdown(r, c) {
  const wins = (r.wins ?? []).map((w) => `- ${w}`).join('\n');
  const watch = (r.watch ?? []).map((w) => `- ${w}`).join('\n');
  const pri = (r.priorities ?? []).map((p, i) => `${i + 1}. **${p.title}** — ${p.reason}`).join('\n');
  return `# ${r.headline}

${r.summary}

**By the numbers:** ${c.completedTasks.length} tasks done · ${c.focusMinutes} min focus · ${c.habitCheckins} habit check-ins · ${c.notesCreated} notes.

## Wins
${wins || '- —'}

## Watch
${watch || '- —'}

## Next week
${pri || '- —'}`;
}

function fallback(c) {
  return {
    headline: `Your week: ${c.completedTasks.length} tasks done, ${c.focusMinutes} min focused`,
    summary:
      c.completedTasks.length || c.focusMinutes
        ? 'Solid, steady progress this week. Keep the momentum going.'
        : 'A quiet week on the tracked metrics — a fresh start is a good opportunity.',
    wins: [
      c.completedTasks.length ? `Completed ${c.completedTasks.length} tasks` : null,
      c.focusMinutes ? `${c.focusMinutes} minutes of focused work` : null,
      c.habitCheckins ? `${c.habitCheckins} habit check-ins` : null
    ].filter(Boolean),
    watch: [],
    priorities: c.completedTasks
      .slice(0, 3)
      .map((t) => ({ title: `Follow up on "${t}"`, reason: 'Recently completed — check for next steps.' }))
  };
}

/** Generate + persist this week's review. Returns { review, markdown, generated, stats, weekStart }. */
export async function runWeeklyReview(userId, { userName } = {}) {
  const c = await gather(userId);

  let review;
  let generated = false;
  try {
    const system = `You are Nexus, ${userName ?? 'the user'}'s second brain. Write an honest, encouraging weekly review grounded ONLY in the data below. Celebrate specific wins, flag what slipped without guilt-tripping, and set 3 concrete priorities for next week.`;
    const model = getStructuredModel(system, REVIEW_SCHEMA);
    const result = await model.generateContent(renderContext(c));
    const parsed = JSON.parse(result.response.text());
    if (parsed?.headline && Array.isArray(parsed.priorities)) {
      review = parsed;
      generated = true;
    } else review = fallback(c);
  } catch (err) {
    console.warn('[workflow:weeklyReview] AI failed, using fallback:', err.message);
    review = fallback(c);
  }

  const markdown = toMarkdown(review, c);
  const weekStartStr = dayStr(c.weekStart);

  // Replace any existing review for this week, then insert fresh.
  await supabaseAdmin.from('weekly_reviews').delete().eq('user_id', userId).eq('week_start', weekStartStr);
  const { data: saved } = await supabaseAdmin
    .from('weekly_reviews')
    .insert({ user_id: userId, week_start: weekStartStr, content_md: markdown })
    .select('*')
    .single();

  return {
    review,
    markdown,
    generated,
    weekStart: weekStartStr,
    generatedAt: saved?.generated_at ?? new Date().toISOString(),
    stats: {
      completedTasks: c.completedTasks.length,
      focusMinutes: c.focusMinutes,
      habitCheckins: c.habitCheckins,
      notesCreated: c.notesCreated
    }
  };
}

/** Fetch the most recent saved review (no generation). */
export async function getLatestReview(userId) {
  const { data } = await supabaseAdmin
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
