/**
 * Manually fire a real alert for a given listing — useful for verifying the
 * Twilio + Telegram pipeline end-to-end without re-queueing alert_events.
 *
 *   POST /api/admin/test-alert?ref=PF-XXXXXXXX[&channel=telegram-channel|wa|tg-dm]
 *   Authorization: Bearer <ADMIN_TOKEN>
 *
 * channel:
 *   - 'telegram-channel' (default) — broadcast to TELEGRAM_CHANNEL_ID
 *   - 'tg-dm:<chat_id>'             — send to a specific Telegram chat (your personal id)
 *   - 'wa:<+9715...>'              — send via Twilio WhatsApp
 */
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { timingSafeEqual } from 'node:crypto';
import { formatWhatsapp, formatTelegram, type AlertContext } from '@/lib/alert-format';
import { sendTelegram } from '@/lib/telegram';
import { sendWhatsapp } from '@/lib/twilio';
import { dropPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

function authorize(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const ref = url.searchParams.get('ref');
  const channel = url.searchParams.get('channel') ?? 'telegram-channel';
  if (!ref) return NextResponse.json({ ok: false, error: 'ref required' }, { status: 400 });

  const r = await sql<{
    external_ref: string;
    project: string;
    developer: string | null;
    community: string;
    sub_location: string | null;
    type: 'off_plan' | 'ready';
    beds: string;
    bathrooms: number | null;
    sqft: number;
    current_price: number;
    original_price: number;
    unit_type: string | null;
    features: string[] | null;
    view: string | null;
    floor_position: string | null;
    handover: string | null;
    payment_status: string | null;
  }>`
    SELECT external_ref, project, developer, community, sub_location, type, beds, bathrooms, sqft,
           current_price, original_price, unit_type, features, view, floor_position, handover, payment_status
    FROM listings WHERE external_ref = ${ref} LIMIT 1;
  `;
  const l = r.rows[0];
  if (!l) return NextResponse.json({ ok: false, error: 'listing not found' }, { status: 404 });

  const webUrl = process.env.PUBLIC_WEB_URL ?? 'https://belowop-demo.vercel.app';
  const ctx: AlertContext = {
    project: l.project,
    community: l.community,
    subLocation: l.sub_location,
    unitType: l.unit_type,
    beds: l.beds,
    bathrooms: l.bathrooms,
    sqft: l.sqft,
    features: l.features ?? [],
    view: l.view,
    floorPosition: l.floor_position,
    handover: l.handover,
    paymentStatus: l.payment_status,
    developer: l.developer,
    type: l.type,
    current: Number(l.current_price),
    original: Number(l.original_price),
    dropPct: dropPct(Number(l.current_price), Number(l.original_price)),
    webUrl,
  };

  const tg = formatTelegram(ctx);
  const wa = formatWhatsapp(ctx);
  // Cache-bust on every test-alert call so we always get a fresh OG render;
  // Telegram otherwise caches photos by URL forever.
  const ogPhotoUrl = `${webUrl}/api/og?ref=${encodeURIComponent(l.external_ref)}&v=${Date.now()}`;
  // Telegram caption max is 1024 chars; strip photo when over.
  const tgPhotoUrl = tg.length <= 1024 ? ogPhotoUrl : undefined;

  if (channel === 'telegram-channel') {
    const target = process.env.TELEGRAM_CHANNEL_ID;
    if (!target) return NextResponse.json({ ok: false, error: 'TELEGRAM_CHANNEL_ID not set' }, { status: 503 });
    const res = await sendTelegram(target, tg, { parseMode: 'MarkdownV2', photoUrl: tgPhotoUrl });
    return NextResponse.json({ ok: res.ok, channel: 'telegram-channel', target, photo: tgPhotoUrl, result: res });
  }
  if (channel.startsWith('tg-dm:')) {
    const target = channel.slice('tg-dm:'.length);
    const res = await sendTelegram(target, tg, { parseMode: 'MarkdownV2', photoUrl: tgPhotoUrl });
    return NextResponse.json({ ok: res.ok, channel: 'tg-dm', target, photo: tgPhotoUrl, result: res });
  }
  if (channel.startsWith('wa:')) {
    const target = channel.slice('wa:'.length);
    const res = await sendWhatsapp(target, wa, ogPhotoUrl);
    return NextResponse.json({ ok: res.ok, channel: 'wa', target, photo: ogPhotoUrl, result: res });
  }
  return NextResponse.json({ ok: false, error: 'unknown channel — use telegram-channel, tg-dm:<id>, or wa:<+phone>' }, { status: 400 });
}
