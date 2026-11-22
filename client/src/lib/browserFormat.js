// How browser tasks read on screen (TaskCard, StepFeed, AgentStrip): the site of a URL and a task's
// status label + Badge intent. Pure; the action_log equivalent is lib/actionStatus.js.

/** "https://www.amazon.in/dp/…" → "amazon.in"; anything unparsable → "". */
export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const STATUS = {
  queued: { label: 'Queued', intent: 'neutral' },
  running: { label: 'Working', intent: 'primary' },
  waiting_user: { label: 'Needs your answer', intent: 'warning' },
  waiting_confirmation: { label: 'Waiting for your OK', intent: 'warning' },
  done: { label: 'Done', intent: 'success' },
  failed: { label: 'Failed', intent: 'danger' },
  stopped: { label: 'Stopped', intent: 'neutral' }
};

/** A task that ended without reaching its goal says "Finished", not "Done". */
export const taskStatusMeta = (t) =>
  t.status === 'done' && t.success === false ? { label: 'Finished', intent: 'neutral' } : (STATUS[t.status] ?? STATUS.queued);
