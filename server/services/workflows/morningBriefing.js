// ─────────────────────────────────────────────────────────────────────────────
//  Morning-briefing workflow
//
//  This is the first of Nexus's AI *workflows*. A workflow is the pattern we use
//  instead of a framework like LangChain: a single readable file that
//    1) GATHERS context from our own DB + integrations,
//    2) REASONS over it with one structured-output Gemini call,
//    3) RETURNS a typed result — with a deterministic fallback so the feature
//       still works when the AI is unavailable (no key, quota, network).
//
//  Weekly Review, "plan my day", etc. will follow this same shape.
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../supabase.js';
import { getStructuredModel } from '../gemini.js';
import * as calendarService from '../calendarService.js';
import { DEFAULT_TZ, dayRangeUtc, hourInTz, formatInTz } from '../time.js';

// Strict JSON contract the model must return. Same OBJECT/STRING/ARRAY vocabulary
// as the tool declarations in gemini.js.
const BRIEFING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    greeting: { type: 'STRING', description: 'e.g. "Good morning, Rama"' },
    headline: { type: 'STRING', description: 'One-line read on the shape of the day.' },
    priorities: {
      type: 'ARRAY',
      description: 'The 3 most important things to focus on today.',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          reason: { type: 'STRING', description: 'Why this matters today, one short clause.' }
        },
        required: ['title', 'reason']
      }
    },
    nudge: { type: 'STRING', description: 'A short, practical closing line.' }
  },
  required: ['greeting', 'headline', 'priorities', 'nudge']
};

// Cache briefings per user for 30 minutes so page refreshes don't re-bill Gemini.
const TTL_MS = 30 * 60_000;
const cache = new Map(); // userId -> { at: number, payload }

function partOfDay(hour) {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function firstNameFromEmail(email) {
  if (!email) return null;
  const raw = email.split('@')[0].split(/[._-]/)[0];
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;
}

/**
 * Pull everything the briefing reasons over. Calendar is best-effort — if the
 * user hasn't connected Google (or it's broken/rate-limited) we just get [].
 */
async function gather(userId, email, tz = DEFAULT_TZ) {
  const now = new Date();
  const { end: endToday } = dayRangeUtc(tz, now); // user-local end-of-day, as a UTC instant

  const { data: openTasks } = await supabaseAdmin
    .from('tasks')
    .select('id, title, due_date, priority, status, project_tag')
    .eq('user_id', userId)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false });

  let events = [];
  try {
    events = await calendarService.listTodaysEvents(userId, tz);
  } catch {
    events = [];
  }

  const tasks = openTasks ?? [];
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < now);
  const dueToday = tasks.filter(t => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    return d >= now && d <= endToday;
  });

  return {
    now,
    tz,
    userName: firstNameFromEmail(email),
    part: partOfDay(hourInTz(tz, now)),
    events,
    tasks,
    overdue,
    dueToday,
    stats: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      events: events.length
    }
  };
}

/** Compact, model-friendly rendering of the gathered context. */
function renderContext(ctx) {
  const fmtTime = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        timeZone: ctx.tz, hour: 'numeric', minute: '2-digit'
      });
    } catch { return ''; }
  };
  const events = ctx.events.length
    ? ctx.events.map(e => `- ${e.all_day ? 'All day' : fmtTime(e.start_time)}: ${e.title}`).join('\n')
    : '(nothing on the calendar)';
  const overdue = ctx.overdue.length
    ? ctx.overdue.map(t => `- ${t.title} [${t.priority}]`).join('\n')
    : '(none)';
  const dueToday = ctx.dueToday.length
    ? ctx.dueToday.map(t => `- ${t.title} [${t.priority}]`).join('\n')
    : '(none)';

  return `Time of day: ${ctx.part}
Date: ${formatInTz(ctx.tz, ctx.now)}

CALENDAR TODAY:
${events}

OVERDUE TASKS:
${overdue}

DUE TODAY:
${dueToday}

Other open tasks not listed above: ${Math.max(0, ctx.tasks.length - ctx.overdue.length - ctx.dueToday.length)}`;
}

/** Deterministic briefing when the AI call is unavailable — never blank. */
function fallbackBriefing(ctx) {
  const name = ctx.userName ? `, ${ctx.userName}` : '';
  const greeting = `Good ${ctx.part}${name}`;
  const bits = [];
  if (ctx.events.length) bits.push(`${ctx.events.length} event${ctx.events.length > 1 ? 's' : ''}`);
  if (ctx.overdue.length) bits.push(`${ctx.overdue.length} overdue`);
  if (ctx.dueToday.length) bits.push(`${ctx.dueToday.length} due today`);
  const headline = bits.length
    ? `You have ${bits.join(', ')} on your plate.`
    : 'A clear slate — a good day to get ahead on something.';
  const priorities = [...ctx.overdue, ...ctx.dueToday].slice(0, 3).map(t => ({
    title: t.title,
    reason: ctx.overdue.includes(t) ? 'Overdue — worth clearing first.' : 'Due today.'
  }));
  const nudge = priorities.length
    ? 'Start with the top item while your focus is fresh.'
    : 'Ask Nexus in chat to plan something for today.';
  return { greeting, headline, priorities, nudge };
}

/**
 * Run the workflow. Returns { briefing, generated, stats, events, generatedAt }.
 * `generated` is false when we served the deterministic fallback.
 */
export async function runMorningBriefing(userId, { email, tz, force = false } = {}) {
  if (!force) {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.payload;
  }

  // Resolve the user's timezone if the caller didn't supply it.
  let resolvedTz = tz;
  if (!resolvedTz) {
    const { data: s } = await supabaseAdmin
      .from('user_settings')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    resolvedTz = s?.timezone || DEFAULT_TZ;
  }

  const ctx = await gather(userId, email, resolvedTz);

  let briefing;
  let generated = false;
  try {
    const system = `You are Nexus, ${ctx.userName ?? 'the user'}'s personal AI second brain.
Write a short, energizing ${ctx.part} briefing grounded in their REAL tasks and events below.
Reference specifics — don't be generic. Choose the 3 things that actually matter most today.
Warm but concise. No filler, no motivational-poster clichés.`;
    const model = getStructuredModel(system, BRIEFING_SCHEMA);
    const result = await model.generateContent(renderContext(ctx));
    const parsed = JSON.parse(result.response.text());
    if (parsed?.greeting && Array.isArray(parsed.priorities)) {
      briefing = parsed;
      generated = true;
    } else {
      briefing = fallbackBriefing(ctx);
    }
  } catch (err) {
    console.warn(`[workflow:morningBriefing] AI call failed, using fallback:`, err.message);
    briefing = fallbackBriefing(ctx);
  }

  const payload = {
    briefing,
    generated,
    stats: ctx.stats,
    events: ctx.events,
    generatedAt: new Date().toISOString()
  };
  cache.set(userId, { at: Date.now(), payload });
  return payload;
}

export function invalidateBriefing(userId) {
  cache.delete(userId);
}
