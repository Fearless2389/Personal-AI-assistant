// Action policy: the pure rules of the confirmation gate. No DB, no clock, no I/O —
// everything here is a decision, so it is unit-tested in actionPolicy.test.js.
// The gate that applies these rules lives in actionGate.js.

/**
 * How much each tool needs your OK before it runs.
 *   safe    — runs at once (reads, and writes that stay inside Nexus)
 *   confirm — waits for an explicit yes (leaves Nexus: your Google account, your phone)
 *   never   — refused outright
 * Unknown tools are treated as `confirm`: a new tool is gated until someone decides.
 */
export const RISK = Object.freeze({
  create_note: 'safe',
  create_task: 'safe',
  log_habit: 'safe',
  track_application: 'safe',
  search_memory: 'safe',
  list_applications: 'safe',
  list_upcoming: 'safe',
  list_recent_actions: 'safe',
  create_calendar_event: 'confirm', // writes to your real Google Calendar
  schedule_reminder: 'confirm' // texts your phone later
});

export const riskOf = (name) => RISK[name] ?? 'confirm';

// Tools that only look things up. They run without a log row — the action log is
// "what Nexus did", and a lookup changes nothing.
const READ_ONLY = new Set(['search_memory', 'list_applications', 'list_upcoming', 'list_recent_actions']);
export const isReadOnly = (name) => READ_ONLY.has(name);

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
    default:
      return `Run ${name}`;
  }
}
