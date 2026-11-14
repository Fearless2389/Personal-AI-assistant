// Human-readable one-liners for chat tool results. Replaces raw JSON in the chat
// "Actions taken" panel and powers the ⌘K capture bar's confirmation chips.
import {
  Briefcase,
  CheckSquare,
  StickyNote,
  CalendarDays,
  BellRing,
  Repeat,
  Search,
  ListChecks,
  AlertCircle,
  History
} from 'lucide-react';
import { stageMeta } from './applications.js';

function when(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
}

const join = (...parts) => parts.filter(Boolean).join(' · ');

/** Where a confirmation chip should take you, if anywhere. */
export function chipTarget(action) {
  if (action.name === 'track_application' && action.result?.application?.id) {
    return `/applications?open=${action.result.application.id}`;
  }
  if (action.name === 'create_task') return '/tasks';
  if (action.name === 'create_note') return '/notes';
  if (action.name === 'create_calendar_event') return '/calendar';
  return null;
}

/** → { icon, text, ok } */
export function summarizeTool(name, args = {}, result = {}) {
  if (result?.ok === false) {
    return { icon: AlertCircle, ok: false, text: result.message || result.error || `${name} failed` };
  }
  switch (name) {
    case 'track_application': {
      const a = result.application ?? args;
      const verb = result.action === 'created' ? 'Tracking' : 'Updated';
      const stage = stageMeta(a.stage).label;
      // Skip a next step that just restates the stage ("OA / Test · OA",
      // "OA / Test · Online assessment", "Interview · Interview").
      const restates =
        a.next_step &&
        (stage.toLowerCase().includes(a.next_step.toLowerCase()) ||
          (a.stage === 'oa' && /^(the )?(oa|online (assessment|test)|assessment|test)$/i.test(a.next_step.trim())) ||
          (a.stage === 'interview' && /^(the )?interview$/i.test(a.next_step.trim())));
      const step = restates ? null : a.next_step;
      return {
        icon: Briefcase,
        ok: true,
        text: join(`${verb} ${a.company}${a.role ? ` ${a.role}` : ''}`, stage, step, when(a.next_deadline))
      };
    }
    case 'create_task':
      return { icon: CheckSquare, ok: true, text: join(`Task: ${args.title ?? result.title}`, when(args.due_date)) };
    case 'create_note':
      return { icon: StickyNote, ok: true, text: `Note saved${result.title ? `: ${result.title}` : ''}` };
    case 'create_calendar_event':
      return { icon: CalendarDays, ok: true, text: join(`Calendar: ${args.title}`, when(args.start_time)) };
    case 'schedule_reminder':
      return { icon: BellRing, ok: true, text: join('Reminder set', when(args.scheduled_at)) };
    case 'log_habit':
      return { icon: Repeat, ok: true, text: result.message ?? `Logged ${args.habit_name}` };
    case 'search_memory':
      return { icon: Search, ok: true, text: `Searched memory: ${result.results?.length ?? 0} match(es)` };
    case 'list_upcoming':
      return {
        icon: ListChecks,
        ok: true,
        text: `Checked the next ${args.days_ahead ?? 7} days: ${result.count ?? 0} item(s)`
      };
    case 'list_applications':
      return { icon: Briefcase, ok: true, text: `Checked the pipeline: ${result.count ?? 0} application(s)` };
    case 'list_recent_actions':
      return { icon: History, ok: true, text: `Checked recent actions: ${result.count ?? 0}` };
    default:
      return { icon: ListChecks, ok: true, text: name };
  }
}
