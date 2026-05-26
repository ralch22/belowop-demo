/**
 * Meta WhatsApp Cloud API inbound webhook.
 *
 * Two responsibilities:
 *
 *  1. GET — Meta's subscription verification handshake.
 *     When you (re)save the webhook config in developers.facebook.com,
 *     Meta hits this URL with `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.
 *     We echo back hub.challenge as plain text iff the verify token matches.
 *
 *  2. POST — Meta delivers events (incoming messages, status updates, etc.)
 *     For v1 we accept + log. Subscriber-side state (last_inbound_at for the
 *     24h customer-service window) lands in a follow-up patch.
 *
 * Required env:
 *   META_WHATSAPP_VERIFY_TOKEN  — shared secret, value matches the field in
 *                                 the Meta app's webhook config.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET — verification handshake
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = process.env.META_WHATSAPP_VERIFY_TOKEN;

  // Both must be set + match. Constant-time compare isn't critical here
  // (this isn't a request-signed endpoint and the failure mode is "Meta
  // rejects verification" not "secret leaks") but cheap to do.
  if (!expected) {
    console.error('[wa-inbound] META_WHATSAPP_VERIFY_TOKEN not set');
    return new Response('server misconfigured', { status: 500 });
  }

  if (mode === 'subscribe' && token === expected && challenge) {
    // Meta requires plain-text echo of challenge, no quotes, no JSON wrapper.
    return new Response(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  console.warn('[wa-inbound] verification rejected', {
    mode,
    tokenMatch: token === expected,
    hasChallenge: Boolean(challenge),
  });
  return new Response('forbidden', { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — event delivery
// ---------------------------------------------------------------------------

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { payload?: string; text?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number; title?: string; message?: string }>;
        }>;
      };
    }>;
  }>;
}

export async function POST(req: Request): Promise<Response> {
  let payload: MetaWebhookPayload;
  try {
    payload = (await req.json()) as MetaWebhookPayload;
  } catch (e) {
    console.error('[wa-inbound] bad json', e);
    // Meta retries on 5xx but not 4xx — return 200 so we don't get rate-limited
    // for a payload we can't parse. Real malformed events are rare.
    return new Response('bad json', { status: 200 });
  }

  // Quick summary line for log-grep. Verbose payload follows on next line.
  const entries = payload.entry ?? [];
  let msgCount = 0;
  let statusCount = 0;
  for (const e of entries) {
    for (const c of e.changes ?? []) {
      msgCount += c.value?.messages?.length ?? 0;
      statusCount += c.value?.statuses?.length ?? 0;
    }
  }
  console.log(
    `[wa-inbound] entries=${entries.length} messages=${msgCount} statuses=${statusCount}`,
  );

  // Full payload for now — when we wire up DB persistence we'll narrow this.
  if (msgCount + statusCount > 0) {
    console.log('[wa-inbound payload]', JSON.stringify(payload).slice(0, 2000));
  }

  // TODO (next patch):
  //   - For each `messages` entry, upsert (phone, last_inbound_at = now)
  //     into the subscribers table — opens the 24h customer-service window.
  //   - For STOP / UNSUBSCRIBE replies, mark the subscriber as unsubscribed.
  //   - For `statuses` entries, persist delivery state so /admin/preview can
  //     show "delivered to N / read by M".

  return NextResponse.json({ ok: true }, { status: 200 });
}
