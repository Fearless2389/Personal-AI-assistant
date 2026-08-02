// Shared reminder scheduling — used by both the /api/reminders route and the chat
// `schedule_reminder` tool. Validates the user has a phone number + SMS opt-in.
import { supabaseAdmin } from './supabase.js';
import { isSmsConfigured } from './sms.js';

export async function scheduleReminder(userId, { message, scheduled_at, linked_type = null, linked_id = null }) {
  if (!message || !scheduled_at) {
    return { ok: false, message: 'message and scheduled_at are required.' };
  }
  const when = new Date(scheduled_at);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, message: 'scheduled_at must be a valid ISO datetime.' };
  }

  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('phone_number, sms_opt_in')
    .eq('id', userId)
    .maybeSingle();

  if (!settings?.phone_number) {
    return { ok: false, message: 'No phone number on file — add one in Settings to receive SMS reminders.' };
  }
  if (settings.sms_opt_in === false) {
    return { ok: false, message: 'SMS reminders are turned off — enable them in Settings.' };
  }

  const { data, error } = await supabaseAdmin
    .from('sms_jobs')
    .insert({
      user_id: userId,
      phone_number: settings.phone_number,
      message,
      scheduled_at: when.toISOString(),
      linked_type,
      linked_id,
      status: 'pending'
    })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    id: data.id,
    scheduled_at: data.scheduled_at,
    delivery: isSmsConfigured()
      ? 'Reminder scheduled — you\'ll get a text at that time.'
      : 'Reminder saved. It will send once SMS is configured on the server.'
  };
}
