// Agenda — one date-sorted list of everything with a deadline: open tasks,
// application next-steps and calendar events. This is the deterministic answer to
// "what's due this week?" (the list_upcoming chat tool) and the data behind the
// Today view's timeline. Semantic search is for "what did I say about X"; dates
// are answered here, by query, so nothing depends on a fuzzy vector match.
import { supabaseAdmin } from './supabase.js';
import * as calendarService from './calendarService.js';
import { ACTIVE_STAGES } from './applicationService.js';
import { DEFAULT_TZ, dayRangeUtc } from './time.js';

const DAY_MS = 24 * 3600_000;

const STAGE_LABEL = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  oa: 'OA',
  interview: 'Interview',
  offer: 'Offer'
};

/**
 * Items due between the start of today and the end of the day `daysAhead` days
 * from now (user-local), plus anything overdue when includeOverdue is set.
 * Returns [{ kind, id, title, detail, at, all_day, overdue }] sorted by `at`.
 */
export async function listUpcoming(
  userId,
  { daysAhead = 7, includeOverdue = true, includeEvents = true, tz = DEFAULT_TZ } = {}
) {
  const now = new Date();
  const days = Math.min(Math.max(Number(daysAhead) || 7, 0), 60);
  const { start: todayStart } = dayRangeUtc(tz, now);
  const { end: rangeEnd } = dayRangeUtc(tz, new Date(now.getTime() + days * DAY_MS));
  const lowerBound = includeOverdue ? null : todayStart.toISOString();

  // Tasks with a due date that aren't done.
  let taskQuery = supabaseAdmin
    .from('tasks')
    .select('id, title, due_date, priority, project_tag')
    .eq('user_id', userId)
    .neq('status', 'done')
    .not('due_date', 'is', null)
    .lte('due_date', rangeEnd.toISOString());
  if (lowerBound) taskQuery = taskQuery.gte('due_date', lowerBound);

  // Live applications whose next step has a deadline.
  let appQuery = supabaseAdmin
    .from('applications')
    .select('id, company, role, stage, next_step, next_deadline')
    .eq('user_id', userId)
    .in('stage', ACTIVE_STAGES)
    .not('next_deadline', 'is', null)
    .lte('next_deadline', rangeEnd.toISOString());
  if (lowerBound) appQuery = appQuery.gte('next_deadline', lowerBound);

  const [tasksRes, appsRes, events] = await Promise.all([
    taskQuery,
    appQuery,
    includeEvents ? fetchEvents(userId, todayStart, rangeEnd) : Promise.resolve([])
  ]);
  if (tasksRes.error) throw tasksRes.error;
  // The applications table arrives with migration 005; degrade instead of failing.
  if (appsRes.error) console.warn('[agenda] applications query failed:', appsRes.error.message);

  const items = [
    ...(tasksRes.data ?? []).map((t) => ({
      kind: 'task',
      id: t.id,
      title: t.title,
      detail: [t.priority === 'high' ? 'High priority' : null, t.project_tag].filter(Boolean).join(' · ') || null,
      at: t.due_date,
      all_day: false
    })),
    ...(appsRes.data ?? []).map((a) => ({
      kind: 'application',
      id: a.id,
      title: `${a.company}${a.next_step ? ` — ${a.next_step}` : ''}`,
      detail: [a.role, STAGE_LABEL[a.stage]].filter(Boolean).join(' · ') || null,
      at: a.next_deadline,
      all_day: false
    })),
    ...events.map((e) => ({
      kind: 'event',
      id: e.google_event_id,
      title: e.title,
      detail: e.location ?? null,
      at: e.start_time,
      all_day: Boolean(e.all_day)
    }))
  ];

  for (const item of items) item.overdue = item.kind !== 'event' && new Date(item.at) < now;
  items.sort((a, b) => new Date(a.at) - new Date(b.at));
  return items;
}

// Calendar is optional: not connected, expired or rate-limited all mean "no events".
async function fetchEvents(userId, from, to) {
  try {
    return await calendarService.listEvents(userId, { timeMin: from.toISOString(), timeMax: to.toISOString() });
  } catch {
    return [];
  }
}
