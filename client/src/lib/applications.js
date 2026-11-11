// Shared application-tracker presentation helpers: stage metadata, company
// monogram colours and deadline countdowns. Used by the board, the drawer, the
// Today pipeline and the timeline so a stage looks the same everywhere.

export const STAGES = [
  { id: 'wishlist', label: 'Wishlist', color: '#8b97a6' },
  { id: 'applied', label: 'Applied', color: '#38bdf8' },
  { id: 'oa', label: 'OA / Test', color: '#f59e0b' },
  { id: 'interview', label: 'Interview', color: '#fb7185' },
  { id: 'offer', label: 'Offer', color: '#2dd4bf' }
];

export const CLOSED_STAGES = [
  { id: 'rejected', label: 'Rejected', color: '#59636f' },
  { id: 'withdrawn', label: 'Withdrawn', color: '#59636f' }
];

const ALL = Object.fromEntries([...STAGES, ...CLOSED_STAGES].map((s) => [s.id, s]));

export function stageMeta(id) {
  return ALL[id] ?? { id, label: id, color: '#8b97a6' };
}

export const CHANNELS = [
  { id: 'on_campus', label: 'On-campus', short: 'ON' },
  { id: 'off_campus', label: 'Off-campus', short: 'OFF' }
];

/** Stable hue per company so "Google" is always the same colour. */
export function monogramStyle(company = '') {
  let h = 0;
  for (const ch of company.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return {
    color: `hsl(${h} 70% 72%)`,
    background: `hsl(${h} 60% 55% / 0.14)`,
    borderColor: `hsl(${h} 60% 60% / 0.28)`
  };
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/**
 * Countdown to a deadline, mission-control style.
 * tone: 'late' (passed) | 'urgent' (<24h) | 'soon' (<72h) | 'later'
 */
export function countdown(iso, now = Date.now()) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms < 0) {
    const late = -ms;
    return {
      label: late < DAY ? `${Math.max(1, Math.round(late / HOUR))}h late` : `${Math.round(late / DAY)}d late`,
      tone: 'late'
    };
  }
  if (ms < HOUR) return { label: `T-${Math.max(1, Math.round(ms / 60_000))}m`, tone: 'urgent' };
  if (ms < 48 * HOUR) return { label: `T-${Math.round(ms / HOUR)}h`, tone: ms < DAY ? 'urgent' : 'soon' };
  return { label: `T-${Math.round(ms / DAY)}d`, tone: ms < 3 * DAY ? 'soon' : 'later' };
}

export const TONE_CLASS = {
  late: 'text-danger bg-danger/10 border-danger/30',
  urgent: 'text-warning bg-warning/10 border-warning/30',
  soon: 'text-nexus-primary bg-nexus-primary/10 border-nexus-primary/30',
  later: 'text-text-secondary bg-surface-3 border-surface-border'
};

/** Days since the card last changed — drives the "quiet" warning. */
export function quietDays(app, now = Date.now()) {
  return Math.floor((now - new Date(app.last_activity_at).getTime()) / DAY);
}

/** ISO → value for <input type="datetime-local"> (browser-local time). */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Blank form state for a new application. */
export function emptyDraft() {
  return {
    company: '',
    role: '',
    channel: 'off_campus',
    stage: 'applied',
    next_step: '',
    next_deadline: null,
    link: '',
    notes: ''
  };
}
