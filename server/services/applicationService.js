// Application tracker — all placement/job application logic lives here so the
// REST route and the chat tools (track_application / list_applications) share
// one implementation of stage rules, history and company matching.
import { supabaseAdmin } from './supabase.js';

export const STAGES = ['wishlist', 'applied', 'oa', 'interview', 'offer', 'rejected', 'withdrawn'];
export const ACTIVE_STAGES = ['wishlist', 'applied', 'oa', 'interview', 'offer'];
const POST_APPLY = new Set(['applied', 'oa', 'interview', 'offer', 'rejected']);

// ── Input normalization ──────────────────────────────────────────────────────
// The model (and humans) say "online assessment", "got shortlisted", "on campus"…
// Map loose phrasing onto the strict DB enums.

const STAGE_ALIASES = [
  [/wish|plan|to.?apply|interested|shortlist(ed)? to apply/i, 'wishlist'],
  [/withdr/i, 'withdrawn'],
  [/reject|declin|not selected|didn.?t make/i, 'rejected'],
  [/offer|selected|placed|got (the )?job/i, 'offer'],
  // OA before interview: "coding round" is a test, "technical round" is an interview.
  [/\boa\b|assessment|\btest\b|coding round|hackerrank|codesignal/i, 'oa'],
  [/interview|\bround\b|\bhr\b|technical|onsite|panel/i, 'interview'],
  [/appl/i, 'applied']
];

export function normalizeStage(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (STAGES.includes(s)) return s;
  for (const [re, stage] of STAGE_ALIASES) if (re.test(s)) return stage;
  return null;
}

export function normalizeChannel(input) {
  if (!input) return null;
  return /on.?campus|campus|college|placement cell|tpo/i.test(String(input)) && !/off/i.test(String(input))
    ? 'on_campus'
    : 'off_campus';
}

function validIso(value) {
  if (value === null) return null;
  if (value === undefined || value === '') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Escape LIKE wildcards so a company named "100%" can't widen the match.
function likeEscape(s) {
  return String(s).replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ── Stage transitions ────────────────────────────────────────────────────────

/** Fields to merge when an application moves to `stage`. */
function stageTransition(existing, stage) {
  const now = new Date().toISOString();
  const history = Array.isArray(existing?.stage_history) ? existing.stage_history : [];
  const patch = {
    stage,
    stage_history: [...history, { stage, at: now }]
  };
  if (POST_APPLY.has(stage) && !existing?.applied_at) patch.applied_at = now;
  return patch;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listApplications(userId, { stage, channel, activeOnly = false } = {}) {
  let q = supabaseAdmin
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .order('next_deadline', { ascending: true, nullsFirst: false })
    .order('last_activity_at', { ascending: false });
  if (stage) q = q.eq('stage', stage);
  if (channel) q = q.eq('channel', channel);
  if (activeOnly) q = q.in('stage', ACTIVE_STAGES);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createApplication(userId, fields) {
  const company = String(fields.company ?? '').trim();
  if (!company) throw Object.assign(new Error('company is required'), { status: 400 });

  const stage = normalizeStage(fields.stage) ?? 'applied';
  const row = {
    user_id: userId,
    company,
    role: fields.role?.trim() || null,
    channel: normalizeChannel(fields.channel) ?? 'off_campus',
    next_step: fields.next_step?.trim() || null,
    next_deadline: validIso(fields.next_deadline) ?? null,
    link: fields.link?.trim() || null,
    source: fields.source?.trim() || null,
    notes: fields.notes?.trim() || null,
    ...stageTransition(null, stage)
  };
  const { data, error } = await supabaseAdmin.from('applications').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

/**
 * Patch an application. A stage change appends to stage_history; any change
 * bumps last_activity_at (which drives the "no movement in N days" nudge).
 */
export async function updateApplication(userId, id, fields) {
  const { data: existing, error: getErr } = await supabaseAdmin
    .from('applications')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (getErr) throw getErr;
  if (!existing) throw Object.assign(new Error('Not found'), { status: 404 });

  const now = new Date().toISOString();
  const patch = { updated_at: now, last_activity_at: now };

  for (const key of ['company', 'role', 'next_step', 'link', 'source', 'notes']) {
    if (fields[key] !== undefined) patch[key] = fields[key] === null ? null : String(fields[key]).trim() || null;
  }
  if (patch.company === null) delete patch.company; // company is NOT NULL
  if (fields.channel !== undefined) patch.channel = normalizeChannel(fields.channel) ?? existing.channel;
  const deadline = validIso(fields.next_deadline);
  if (deadline !== undefined) patch.next_deadline = deadline;

  if (fields.stage !== undefined) {
    const stage = normalizeStage(fields.stage);
    if (!stage)
      throw Object.assign(new Error(`Unknown stage: ${fields.stage}`), {
        status: 400
      });
    if (stage !== existing.stage) Object.assign(patch, stageTransition(existing, stage));
  }

  const { data, error } = await supabaseAdmin
    .from('applications')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteApplication(userId, id) {
  const { error } = await supabaseAdmin.from('applications').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// ── Chat: find-or-update ─────────────────────────────────────────────────────

async function findMatches(userId, company, role) {
  const base = () => supabaseAdmin.from('applications').select('*').eq('user_id', userId);
  let { data } = await base().ilike('company', likeEscape(company));
  if (!data?.length) ({ data } = await base().ilike('company', `%${likeEscape(company)}%`));
  let matches = data ?? [];
  if (role && matches.length > 1) {
    const r = role.toLowerCase();
    const byRole = matches.filter(
      (m) => m.role && (m.role.toLowerCase().includes(r) || r.includes(m.role.toLowerCase()))
    );
    if (byRole.length) matches = byRole;
  }
  // Prefer live applications over closed ones from earlier cycles.
  const active = matches.filter((m) => ACTIVE_STAGES.includes(m.stage));
  return active.length ? active : matches;
}

/**
 * What the chat tool calls. Updates the matching application if one exists,
 * otherwise creates it. Ambiguous matches are returned so the model can ask.
 */
export async function trackApplication(userId, args = {}) {
  const company = String(args.company ?? '').trim();
  if (!company) return { ok: false, message: 'Which company is this for?' };

  const matches = await findMatches(userId, company, args.role);
  if (matches.length > 1) {
    return {
      ok: false,
      ambiguous: true,
      message: `Rama has ${matches.length} ${company} applications — ask which role.`,
      candidates: matches.map((m) => ({
        id: m.id,
        role: m.role,
        stage: m.stage
      }))
    };
  }

  if (matches.length === 1) {
    const app = await updateApplication(userId, matches[0].id, args);
    return { ok: true, action: 'updated', application: summarize(app) };
  }
  const app = await createApplication(userId, args);
  return { ok: true, action: 'created', application: summarize(app) };
}

/** Compact shape for tool results and prompts. */
export function summarize(a) {
  return {
    id: a.id,
    company: a.company,
    role: a.role,
    channel: a.channel,
    stage: a.stage,
    next_step: a.next_step,
    next_deadline: a.next_deadline,
    last_activity_at: a.last_activity_at
  };
}
