// Inbound Twilio SMS webhook — handles replies (STOP/START opt-out, otherwise ack).
// Real (Phase 3). Point your Twilio number's "A message comes in" webhook at
//   POST {PUBLIC_BASE_URL}/api/webhooks/twilio
import express, { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { validateTwilioSignature } from '../middleware/twilioSignature.js';

const router = Router();

// Twilio posts application/x-www-form-urlencoded; parse it just for this router.
router.use(express.urlencoded({ extended: false }));

function twiml(message) {
  const body = message ? `<Message>${message}</Message>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

// POST /api/webhooks/twilio
router.post('/twilio', validateTwilioSignature, async (req, res) => {
  const from = req.body.From;
  const text = String(req.body.Body ?? '').trim();
  const upper = text.toUpperCase();
  res.type('text/xml');

  try {
    if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(upper)) {
      await supabaseAdmin.from('user_settings').update({ sms_opt_in: false }).eq('phone_number', from);
      return res.send(twiml('You have been unsubscribed from Nexus reminders. Reply START to resume.'));
    }
    if (['START', 'YES', 'UNSTOP'].includes(upper)) {
      await supabaseAdmin.from('user_settings').update({ sms_opt_in: true }).eq('phone_number', from);
      return res.send(twiml('You are subscribed to Nexus reminders again.'));
    }
    // Default: friendly acknowledgement (richer intent parsing is future work).
    return res.send(twiml("Got it — I'll keep this in mind. Manage reminders in the Nexus app."));
  } catch (err) {
    console.error(`[webhooks:${req.id}] twilio inbound failed:`, err.message);
    return res.send(twiml());
  }
});

// GET for quick reachability checks
router.get('/twilio', (_req, res) => res.json({ ok: true, hint: 'POST here from Twilio' }));

export default router;
