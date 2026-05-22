/**
 * Twilio WhatsApp sender — sandbox-compatible.
 *
 * In Twilio's sandbox, you can only message numbers that have joined the
 * sandbox by texting the join code (e.g. "join green-house") to the sandbox
 * number. For production, templates must be Meta-approved and TWILIO_WHATSAPP_FROM
 * should be your verified business number.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM  (e.g. whatsapp:+14155238886 for sandbox)
 */

const HAS_CREDS = Boolean(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM,
);

export function isWhatsappConfigured(): boolean {
  return HAS_CREDS;
}

export async function sendWhatsapp(to: string, body: string, mediaUrl?: string): Promise<{ ok: boolean; error?: string; sid?: string }> {
  if (!HAS_CREDS) {
    console.log(`[whatsapp · stub → ${to}]`, body);
    return { ok: true, sid: 'stub' };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!;

  const toWa = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const params = new URLSearchParams({ To: toWa, From: from, Body: body });
  if (mediaUrl) params.set('MediaUrl', mediaUrl);

  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!resp.ok) {
    const error = await resp.text();
    return { ok: false, error: `Twilio ${resp.status}: ${error.slice(0, 200)}` };
  }
  const data = await resp.json();
  return { ok: true, sid: data.sid };
}
