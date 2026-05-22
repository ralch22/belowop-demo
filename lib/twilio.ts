/**
 * Twilio WhatsApp sender — RETIRED 2026-05-22.
 *
 * Jad's existing WABA "Distress Deals Dubai" (+1 555-976-4984) is already
 * Meta-verified + Marketing-enabled, which makes Meta Cloud API direct the
 * optimal transport. This file remains so existing call sites compile and
 * stub-success in dev (HAS_CREDS will always be false in production); the
 * production WhatsApp path is being rebuilt as `lib/whatsapp.ts` against
 * graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages.
 *
 * See:
 *   docs/WhatsApp-Integration-Plan.md  ← current plan (Meta direct)
 *   docs/GHL-vs-Twilio.md              ← evaluation history
 *   docs/BelowOP-Twilio-Setup.pdf      ← archived setup guide
 *
 * Per client direction 2026-05-22, this work is DEFERRED behind table-pipeline
 * hardening (tasks #65-#68). Until that lands, do not wire new code paths
 * through this module — Telegram is the only live alert transport.
 *
 * Required env vars (historical):
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
