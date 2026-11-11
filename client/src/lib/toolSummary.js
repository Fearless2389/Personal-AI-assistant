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
  AlertCircle
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
      // Skip a next step that just restates the stage ("OA / Test · OA").
      const step = a.next_step && !stage.toLowerCase().includes(a.next_step.toLowerCase()) ? a.next_step : null;
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
    default:
      return { icon: ListChecks, ok: true, text: name };
  }
}
