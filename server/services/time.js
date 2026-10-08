// Timezone-aware date helpers, built on the platform Intl API (no external deps).
//
// Why this exists: the server runs in UTC (Render), but "is this due today?" and
// "what hour is it for the user?" must be answered in the USER's timezone, or a
// late-evening IST deadline reads as tomorrow and the 8am briefing fires at the
// wrong time. Every date-bucketing decision in Nexus should route through here.
//
// India (the default user) has no DST, so the offset-at-now approach below is
// exact. For DST zones it is correct except within the ~1h around a transition,
// which is acceptable for briefings and due-today bucketing.

export const DEFAULT_TZ = process.env.DEFAULT_TZ || 'Asia/Kolkata';

// Break an instant into wall-clock parts for a timezone.
function partsInTz(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const out = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

// Offset in ms such that (utc epoch + offset) reads as the tz wall clock.
function tzOffsetMs(tz, date) {
  const p = partsInTz(tz, date);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - date.getTime();
}

/** Integer hour 0-23 in the given timezone. */
export function hourInTz(tz = DEFAULT_TZ, date = new Date()) {
  return +partsInTz(tz, date).hour;
}

/** 'YYYY-MM-DD' calendar day in the given timezone — used to dedupe once-per-day jobs. */
export function localDateKey(tz = DEFAULT_TZ, date = new Date()) {
  const p = partsInTz(tz, date);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * UTC instants for the start and end of the tz-local day containing `date`.
 * Returns Date objects and ISO strings for direct use in DB range queries.
 */
export function dayRangeUtc(tz = DEFAULT_TZ, date = new Date()) {
  const p = partsInTz(tz, date);
  const offset = tzOffsetMs(tz, date);
  const startLocalAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0, 0);
  const start = new Date(startLocalAsUtc - offset);
  const end = new Date(start.getTime() + 24 * 3600_000 - 1);
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Human-readable current date/time in the user's timezone, for prompts. */
export function formatInTz(tz = DEFAULT_TZ, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    }).format(date);
  } catch {
    return date.toString();
  }
}
