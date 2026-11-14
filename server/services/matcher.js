// Find the item a person means by name ("the resume task", "meditation"). Pure:
// no DB — callers pass the rows. Tested in matcher.test.js.
//
// Tiers, first hit wins: exact name → name starts with the query (or vice versa) →
// name contains the query → every query word appears in the name. One hit in a tier
// is a match; several are ambiguous (the assistant asks which); none falls through.

// Words people add that are not part of the item's name.
const FILLER = new Set(['the', 'my', 'a', 'an', 'task', 'todo', 'habit', 'note', 'goal', 'reminder', 'milestone']);

export const normalizeName = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripFiller = (q) =>
  q
    .split(' ')
    .filter((w) => !FILLER.has(w))
    .join(' ');

const TIERS = [
  (name, q) => name === q,
  (name, q) => name.startsWith(q) || q.startsWith(name),
  (name, q) => name.includes(q),
  (name, q) => q.split(' ').every((w) => name.includes(w))
];

/**
 * rows: items to search; labelOf: row → its name.
 * → { status: 'found', row } | { status: 'ambiguous', rows } | { status: 'none' }
 */
export function pickByName(rows, query, labelOf = (r) => r.title) {
  const raw = normalizeName(query);
  const q = stripFiller(raw) || raw;
  if (!q) return { status: 'none' };
  const named = (rows ?? []).map((row) => ({ row, name: normalizeName(labelOf(row)) })).filter((x) => x.name);
  for (const tier of TIERS) {
    const hits = named.filter((x) => tier(x.name, q));
    if (hits.length === 1) return { status: 'found', row: hits[0].row };
    if (hits.length > 1) return { status: 'ambiguous', rows: hits.map((h) => h.row) };
  }
  return { status: 'none' };
}
