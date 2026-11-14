// One place for how an action_log status looks (label + Badge intent). Used by the
// voice confirmation card and the Settings recent-actions list.
const STATUS = {
  awaiting_confirmation: { label: 'Waiting for your OK', intent: 'warning' },
  working: { label: 'Working…', intent: 'primary' }, // client-only, while a tap is in flight
  confirmed: { label: 'Running', intent: 'primary' },
  executed: { label: 'Done', intent: 'success' },
  failed: { label: 'Failed', intent: 'danger' },
  cancelled: { label: 'Cancelled', intent: 'neutral' },
  expired: { label: 'Expired', intent: 'neutral' },
  blocked: { label: 'Blocked', intent: 'danger' }
};

export const actionStatusMeta = (status) => STATUS[status] ?? { label: status, intent: 'neutral' };
