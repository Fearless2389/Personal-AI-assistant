// "Nexus noticed" — proactive nudges, computed fresh on every request from the
// user's own data. Deterministic on purpose: no Gemini call, so they are instant,
// free, and always correct. Only dismissals/snoozes are stored (nudge_dismissals).
//
// Each nudge: { key, kind, severity, title, detail, at, actions: [{ label, prompt? , to? }] }
//   - `key` is stable for the situation it describes, so dismissing "OA in 26h"
//     doesn't hide next week's different deadline.
//   - an action with `prompt` opens chat pre-filled; one with `to` navigates.
import { supabaseAdmin } from './supabase.js';
import { ACTIVE_STAGES } from './applicationService.js';
import { listHabitsWithToday } from './habitService.js';
import { DEFAULT_TZ, dayRangeUtc, hourInTz, localDateKey } from './time.js';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const STALE_AFTER_DAYS = 10; // an "applied" card with no movement for this long gets a follow-up nudge
const EVENING_HOUR = 18;
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

function relativeHours(ms) {
  const h = Math.round(ms / HOUR);
  if (h < 1) return 'under an hour';
  if (h < 36) return `${h}h`;
  return `${Math.round(ms / DAY)} days`;
}

function shortWhen(iso, tz) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(iso));
}

/** Pure: application rows → nudges. Exported for unit tests. */
export function applicationNudges(apps, now, tz) {
  const out = [];
  for (const a of apps) {
    const label = `${a.company}${a.role ? ` ${a.role}` : ''}`;
    const step = a.next_step || (a.stage === 'oa' ? 'OA' : a.stage);

    if (a.next_deadline) {
      const delta = new Date(a.next_deadline) - now;
      if (delta > 0 && delta <= 48 * HOUR) {
        out.push({
          key: `due:${a.id}:${a.next_deadline}`,
          kind: 'deadline',
          severity: delta <= 24 * HOUR ? 'high' : 'medium',
          title: `${a.company} ${step} in ${relativeHours(delta)}`,
          detail: `${label} · ${shortWhen(a.next_deadline, tz)}`,
          at: a.next_deadline,
          actions: [
            {
              label: 'Prep plan',
              prompt: `Make me a focused prep plan for my ${label} ${step} on ${shortWhen(a.next_deadline, tz)}. I have limited time, so prioritise.`
            },
            { label: 'Open', to: `/applications?open=${a.id}` }
          ]
        });
        continue;
      }
      if (delta < 0 && -delta <= 14 * DAY) {
        out.push({
          key: `late:${a.id}:${a.next_deadline}`,
          kind: 'overdue',
          severity: 'medium',
          title: `${a.company}: ${step} date has passed`,
          detail: `Was due ${relativeHours(-delta)} ago. Did it happen? Update the card so the pipeline stays honest.`,
          at: a.next_deadline,
          actions: [{ label: 'Update', to: `/applications?open=${a.id}` }]
        });
        continue;
      }
    }

    const quietFor = now - new Date(a.last_activity_at);
    const hasFutureStep = a.next_deadline && new Date(a.next_deadline) > now;
    if (a.stage === 'applied' && !hasFutureStep && quietFor >= STALE_AFTER_DAYS * DAY) {
      out.push({
        key: `stale:${a.id}`,
        kind: 'follow_up',
        severity: 'low',
        title: `${a.company}: no movement in ${Math.floor(quietFor / DAY)} days`,
        detail: `${label}. A short, polite follow-up often gets a reply.`,
        at: a.last_activity_at,
        actions: [
          {
            label: 'Draft follow-up',
            prompt: `Draft a short, polite follow-up email to ${a.company} about my ${a.role || ''} application. I applied about ${Math.floor(quietFor / DAY)} days ago.`
          },
          { label: 'Open', to: `/applications?open=${a.id}` }
        ]
      });
    }
  }
  return out;
}

/** All active nudges for a user, minus anything dismissed or still snoozed. */
export async function computeNudges(userId, { tz = DEFAULT_TZ } = {}) {
  const now = new Date();
  const today = localDateKey(tz, now);
  const evening = hourInTz(tz, now) >= EVENING_HOUR;
  const { start: tomorrowStart, end: tomorrowEnd } = dayRangeUtc(tz, new Date(now.getTime() + DAY));

  const [appsRes, overdueRes, tomorrowTasksRes, habits, dismissRes] = await Promise.all([
    supabaseAdmin
      .from('applications')
      .select('id, company, role, stage, next_step, next_deadline, last_activity_at')
      .eq('user_id', userId)
      .in('stage', ACTIVE_STAGES),
    supabaseAdmin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('status', 'done')
      .lt('due_date', now.toISOString()),
    evening
      ? supabaseAdmin
          .from('tasks')
          .select('title, due_date')
          .eq('user_id', userId)
          .neq('status', 'done')
          .gte('due_date', tomorrowStart.toISOString())
          .lte('due_date', tomorrowEnd.toISOString())
      : Promise.resolve({ data: [] }),
    evening ? listHabitsWithToday(userId).catch(() => []) : Promise.resolve([]),
    supabaseAdmin.from('nudge_dismissals').select('nudge_key, until').eq('user_id', userId)
  ]);

  const apps = appsRes.error ? [] : (appsRes.data ?? []);
  const nudges = applicationNudges(apps, now, tz);

  const overdueCount = overdueRes.count ?? 0;
  if (overdueCount > 0) {
    nudges.push({
      key: `overdue-tasks:${today}`,
      kind: 'overdue',
      severity: overdueCount >= 3 ? 'medium' : 'low',
      title: `${overdueCount} task${overdueCount > 1 ? 's' : ''} overdue`,
      detail: 'Clear them, push the dates, or drop what no longer matters.',
      at: now.toISOString(),
      actions: [{ label: 'Review', to: '/tasks?filter=overdue' }]
    });
  }

  if (evening) {
    // The evening heads-up: what lands tomorrow (tasks + placement steps).
    const tomorrowApps = apps.filter(
      (a) => a.next_deadline && new Date(a.next_deadline) >= tomorrowStart && new Date(a.next_deadline) <= tomorrowEnd
    );
    const tomorrowItems = [
      ...tomorrowApps.map((a) => `${a.company} ${a.next_step || a.stage}`),
      ...(tomorrowTasksRes.data ?? []).map((t) => t.title)
    ];
    if (tomorrowItems.length) {
      nudges.push({
        key: `tomorrow:${today}`,
        kind: 'heads_up',
        severity: 'medium',
        title: `Tomorrow: ${tomorrowItems.length} thing${tomorrowItems.length > 1 ? 's' : ''} due`,
        detail: tomorrowItems.slice(0, 4).join(' · ') + (tomorrowItems.length > 4 ? ' …' : ''),
        at: tomorrowStart.toISOString(),
        actions: [{ label: 'Plan tomorrow', prompt: 'Plan tomorrow for me around what is due. Keep it realistic.' }]
      });
    }

    const openHabits = habits.filter((h) => !h.done_today);
    if (openHabits.length) {
      nudges.push({
        key: `habits:${today}`,
        kind: 'habit',
        severity: 'low',
        title: `${openHabits.length} habit${openHabits.length > 1 ? 's' : ''} still open today`,
        detail: openHabits
          .slice(0, 3)
          .map((h) => h.name)
          .join(' · '),
        at: now.toISOString(),
        actions: [{ label: 'Check in', to: '/habits' }]
      });
    }
  }

  const dismissed = new Map((dismissRes.error ? [] : (dismissRes.data ?? [])).map((d) => [d.nudge_key, d.until]));
  return nudges
    .filter((n) => {
      if (!dismissed.has(n.key)) return true;
      const until = dismissed.get(n.key);
      return until !== null && new Date(until) <= now; // snooze expired
    })
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || new Date(a.at) - new Date(b.at));
}

/** Dismiss for good (snoozeHours omitted) or hide until now + snoozeHours. */
export async function dismissNudge(userId, key, { snoozeHours } = {}) {
  if (!key) throw Object.assign(new Error('key is required'), { status: 400 });
  const until = snoozeHours ? new Date(Date.now() + Number(snoozeHours) * HOUR).toISOString() : null;
  const { error } = await supabaseAdmin
    .from('nudge_dismissals')
    .upsert({ user_id: userId, nudge_key: String(key), until }, { onConflict: 'user_id,nudge_key' });
  if (error) throw error;
}
