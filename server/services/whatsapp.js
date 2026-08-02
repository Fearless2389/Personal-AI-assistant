// WhatsApp Cloud API sender (optional, Phase 5). Functional but unwired — needs a
// Meta Business app + phone number ID. Mirrors sms.js: fetch-based, no SDK.
export function isWhatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsapp(to, body) {
  if (!isWhatsappConfigured()) {
    throw new Error('WhatsApp is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).');
  }
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body }
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WhatsApp ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
