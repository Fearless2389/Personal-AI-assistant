// get_briefing: today's briefing for voice and chat ("good morning", "brief me").
// The same workflow (and 30-minute cache) as the Today page, so what Nexus says
// matches what the page shows. Read-only.
import { supabaseAdmin } from './supabase.js';
import { runMorningBriefing } from './workflows/morningBriefing.js';

async function loginEmail(userId) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId).catch(() => ({ data: null }));
  return data?.user?.email ?? null;
}

async function getBriefing(userId, args, { tz }) {
  const { briefing, generated, stats, events } = await runMorningBriefing(userId, {
    email: await loginEmail(userId),
    tz,
    force: args.refresh === true
  });
  return {
    ok: true,
    generated,
    briefing,
    calendar_today: (events ?? []).map((e) => ({ title: e.title, start: e.start_time, all_day: e.all_day })),
    stats,
    message:
      'Give the briefing in your own words: the headline, then the top priorities with their reasons, then the ' +
      'nudge. Out loud keep it to about four short sentences; never read lists of fields or times in ISO format.'
  };
}

export const BRIEFING_HANDLERS = Object.freeze({ get_briefing: getBriefing });

export const BRIEFING_DECLARATIONS = [
  {
    name: 'get_briefing',
    description:
      "Rama's briefing for today: a headline, the 3 things that matter most (placement deadlines, overdue and " +
      "due-today tasks, today's events) and a closing nudge. Use for \"good morning\", \"brief me\", " +
      '"what does my day look like", "read my briefing".',
    parameters: {
      type: 'OBJECT',
      properties: {
        refresh: { type: 'BOOLEAN', description: 'true only if Rama asks for a fresh one. Default false.' }
      }
    }
  }
];
