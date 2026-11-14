// Action policy: the pure rules of the confirmation gate. No DB, no clock, no I/O —
// everything here is a decision, so it is unit-tested in actionPolicy.test.js.
// The gate that applies these rules lives in actionGate.js.

/**
 * How much each tool needs your OK before it runs.
 *   safe    — runs at once (reads, and writes that stay inside Nexus)
 *   confirm — waits for an explicit yes (leaves Nexus: your Google account, your phone)
 *   never   — refused outright
 * A tool with an `action` argument can set a level per action, with '*' as its
 * default: deleting your own data waits for a yes, everything else runs at once.
 * Unknown tools (and unknown actions without a '*') are treated as `confirm`: a new
 * capability is gated until someone decides.
 */
const DELETE_NEEDS_OK = Object.freeze({ delete: 'confirm', '*': 'safe' });

export const RISK = Object.freeze({
  create_note: 'safe',
  create_task: 'safe',
  track_application: 'safe',
  manage_task: DELETE_NEEDS_OK,
  manage_habit: DELETE_NEEDS_OK,
  manage_note: DELETE_NEEDS_OK,
  manage_goal: DELETE_NEEDS_OK,
  manage_reminder: 'safe', // list, cancel — cancelling only removes a pending text
  search_email: 'safe',
  read_email: 'safe',
  draft_email: 'safe', // lands in Drafts; nothing leaves the account
  send_email: 'confirm', // always: it leaves your account and can't be unsent
  manage_calendar_event: Object.freeze({ list: 'safe', '*': 'confirm' }), // your real calendar
  resolve_pending_action: 'safe', // the gate itself decides; see actionGate.resolvePending
  search_memory: 'safe',
  list_applications: 'safe',
  list_upcoming: 'safe',
  list_recent_actions: 'safe',
  create_calendar_event: 'confirm', // writes to your real Google Calendar
  schedule_reminder: 'confirm' // texts your phone later
});

export function riskOf(name, args = {}) {
  const level = RISK[name];
  if (!level) return 'confirm';
  if (typeof level === 'string') return level;
  return level[args?.action] ?? level['*'] ?? 'confirm';
}

// Lookups run without a log row — the action log is "what Nexus did", and a lookup
// changes nothing. Whole tools, plus the list/read actions of manage_* tools.
const READ_ONLY = new Set([
  'search_memory',
  'list_applications',
  'list_upcoming',
  'list_recent_actions',
  'search_email',
  'read_email'
]);
const READ_ACTIONS = new Set(['list', 'read']);
export const isReadOnly = (name, args = {}) =>
  READ_ONLY.has(name) || (name.startsWith('manage_') && READ_ACTIONS.has(args?.action));

/** manage_task → 'task'. */
export const entityOf = (name) => (name.startsWith('manage_') ? name.slice('manage_'.length) : null);

/** A pending action can be approved for this long after it was proposed. */
export const CONFIRM_TTL_MS = 2 * 60_000;

// Your own words, from the speech-to-text of your microphone (never the model's
// output). The WHOLE utterance must be made of these phrases ("yes", "yes go
// ahead", "okay do it"), so "yes but move it to 6" is not a yes.
const YES_PHRASES =
  "yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|do it|go ahead|go for it|please|please do|sounds good|that's right|thats right|correct|absolutely|of course";
const NO_PHRASES =
  "no|nope|nah|cancel|cancel it|cancel that|stop|don't|dont|do not|never mind|nevermind|forget it|scratch that|abort";
const onlyPhrases = (list) => new RegExp(`^(?:(?:${list})(?: |$))+$`);
const AFFIRMATIVE = onlyPhrases(YES_PHRASES);
const NEGATIVE = onlyPhrases(NO_PHRASES);

const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isAffirmative = (text) => AFFIRMATIVE.test(normalize(text));
export const isNegative = (text) => NEGATIVE.test(normalize(text));

/** May this pending action still be approved? */
export function isFresh(createdAt, now) {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t <= CONFIRM_TTL_MS;
}

/** Short spoken/visual description of what a risky action will do once confirmed. */
export function describeAction(name, args = {}, formatWhen = (iso) => iso) {
  const when = (iso) => (iso ? ` on ${formatWhen(iso)}` : '');
  switch (name) {
    case 'create_calendar_event':
      return `Add "${args.title ?? 'an event'}" to your Google Calendar${when(args.start_time)}`;
    case 'schedule_reminder':
      return `Text you "${args.message ?? 'a reminder'}"${when(args.scheduled_at)}`;
    case 'send_email': {
      const body = String(args.body ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      const preview = body.length > 90 ? `${body.slice(0, 90)}…` : body;
      return `Email ${args.to}: "${args.subject || '(no subject)'}" — ${preview}`;
    }
    case 'manage_calendar_event': {
      const label = `"${args.target_label ?? args.event ?? 'the event'}"`;
      if (args.action === 'delete') return `Delete ${label}${when(args.target_start)} from your Google Calendar`;
      const changes = [
        args.new_title && `rename it "${args.new_title}"`,
        args.start_time && `move it to ${formatWhen(args.start_time)}`,
        args.location && `set the place to ${args.location}`
      ].filter(Boolean);
      return `Change ${label}: ${changes.join(', ') || 'update details'}`;
    }
    default:
      {
        // manage_* deletes: target_label is pinned by the gate after it resolves the item.
        const entity = entityOf(name);
        if (entity && args.action === 'delete') {
          return `Delete the ${entity} "${args.target_label ?? args[entity] ?? 'item'}"`;
        }
        return `Run ${name}`;
      }
      return `Run ${name}`;
  }
}
