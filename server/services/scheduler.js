// In-process SMS scheduler — polls the sms_jobs table for due reminders and sends
// them. Chosen over BullMQ + Upstash Redis to stay dependency-light and free-tier.
// (Scale-up path: swap this poller for a BullMQ worker; the sms_jobs table already
//  has a bull_job_id column for that migration.)
import { supabaseAdmin } from './supabase.js';
import { sendSms, isSmsConfigured } from './sms.js';
import { runMorningBriefing } from './workflows/morningBriefing.js';
import { deliverBriefing } from './briefingDelivery.js';
import { hourInTz, localDateKey, DEFAULT_TZ } from './time.js';

const POLL_MS = 30_000;
const MAX_ATTEMPTS = 3;
let timer = null;

async function tick() {
  if (!isSmsConfigured()) return; // no Twilio yet — leave jobs pending

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabaseAdmin
    .from('sms_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(20);
  if (error) { console.error('[scheduler] query failed:', error.message); return; }

  for (const job of due ?? []) {
    // Atomically claim the job: flip pending → sending only if still pending.
    const { data: claimed } = await supabaseAdmin
      .from('sms_jobs')
      .update({ status: 'sending', attempts: (job.attempts ?? 0) + 1 })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) continue; // another tick/instance took it

    try {
      await sendSms(job.phone_number, job.message);
      await supabaseAdmin
        .from('sms_jobs')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', job.id);
    } catch (err) {
      const attempts = (job.attempts ?? 0) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await supabaseAdmin
        .from('sms_jobs')
        .update({ status: giveUp ? 'failed' : 'pending', last_error: err.message })
        .eq('id', job.id);
      console.error(`[scheduler] job ${job.id} attempt ${attempts} failed:`, err.message);
    }
  }
}

// ── Daily morning briefing ───────────────────────────────────────────────────
// Once per user per local day, at their chosen hour, generate the briefing and
// push it over their configured channel. Runs on the same poll as SMS; the
// hour-match + last_briefing_on guard make it fire at most once a day.
async function briefingTick() {
  const { data: users, error } = await supabaseAdmin
    .from('user_settings')
    .select('id, timezone, briefing_hour, last_briefing_on, phone_number, whatsapp_number, sms_opt_in, whatsapp_opt_in')
    .eq('briefing_enabled', true);
  if (error) { console.error('[briefing] query failed:', error.message); return; }

  for (const s of users ?? []) {
    const tz = s.timezone || DEFAULT_TZ;
    if (hourInTz(tz) !== (s.briefing_hour ?? 8)) continue;
    const today = localDateKey(tz);
    if (s.last_briefing_on === today) continue;

    // Claim today's slot atomically so overlapping ticks can't double-send.
    const { data: claimed } = await supabaseAdmin
      .from('user_settings')
      .update({ last_briefing_on: today })
      .eq('id', s.id)
      .or(`last_briefing_on.is.null,last_briefing_on.neq.${today}`)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    try {
      const { data: userRec } = await supabaseAdmin.auth.admin.getUserById(s.id);
      const payload = await runMorningBriefing(s.id, {
        email: userRec?.user?.email ?? null, tz, force: true
      });
      const { delivered, channel } = await deliverBriefing(s.id, payload, s);
      console.log(`[briefing] ${s.id}: ${delivered ? `sent via ${channel}` : 'generated (no channel)'}`);
    } catch (err) {
      console.error(`[briefing] failed for ${s.id}:`, err.message);
    }
  }
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch(e => console.error('[scheduler]', e.message));
    briefingTick().catch(e => console.error('[briefing]', e.message));
  }, POLL_MS);
  timer.unref?.();
  console.log(
    isSmsConfigured()
      ? `[scheduler] SMS poller started (every ${POLL_MS / 1000}s)`
      : '[scheduler] started — SMS not configured, jobs will queue until Twilio keys are set'
  );
}
