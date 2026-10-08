// Briefing delivery seam. Turns a morning-briefing payload into a plain-text
// message and pushes it over whatever channel the user has enabled AND that is
// configured on the server. Until a channel is set up this is a logged no-op —
// exactly how sms_jobs queue without Twilio. When you pick a channel later, no
// code here changes: set the env keys + the user's opt-in and delivery begins.
import { isSmsConfigured, sendSms } from './sms.js';
import { isWhatsappConfigured, sendWhatsapp } from './whatsapp.js';

/** Render a briefing payload as a short text message. */
export function renderBriefingText(payload) {
  const b = payload?.briefing ?? {};
  const lines = [];
  lines.push((b.greeting || 'Your briefing').replace(/\.$/, ''));
  if (b.headline) lines.push(b.headline);
  if (Array.isArray(b.priorities) && b.priorities.length) {
    lines.push('');
    lines.push('Today:');
    b.priorities.forEach((p, i) => lines.push(`${i + 1}. ${p.title}${p.reason ? ` — ${p.reason}` : ''}`));
  }
  if (b.nudge) {
    lines.push('');
    lines.push(b.nudge);
  }
  lines.push('');
  lines.push('— Nexus');
  return lines.join('\n');
}

/**
 * Deliver a briefing. Tries WhatsApp (free sandbox) first, then SMS. Returns
 * { delivered, channel }. Never throws — a delivery failure is logged, not fatal.
 */
export async function deliverBriefing(userId, payload, settings) {
  const body = renderBriefingText(payload);
  try {
    if (settings?.whatsapp_opt_in && settings?.whatsapp_number && isWhatsappConfigured()) {
      await sendWhatsapp(settings.whatsapp_number, body);
      return { delivered: true, channel: 'whatsapp' };
    }
    if (settings?.sms_opt_in && settings?.phone_number && isSmsConfigured()) {
      await sendSms(settings.phone_number, body);
      return { delivered: true, channel: 'sms' };
    }
  } catch (err) {
    console.error(`[briefing] delivery failed for ${userId}:`, err.message);
    return { delivered: false, channel: null, error: err.message };
  }
  console.log(`[briefing] generated for ${userId}; no channel configured — not delivered:\n${body}\n`);
  return { delivered: false, channel: null };
}
