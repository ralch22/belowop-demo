/**
 * Subscription opt-in endpoint.
 *
 * Writes a pending row, generates a confirm token, and sends a confirmation
 * message via the chosen channel. The user must reply (WhatsApp) or click
 * the link (Telegram / email) to activate (double opt-in).
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createPendingSubscription, isDbConfigured } from '@/lib/db';
import { sendWhatsapp } from '@/lib/twilio';
import { sendTelegram, escapeMd } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { channel, contact, filters, consent } = body ?? {};

  if (!channel || !contact || !consent) {
    return NextResponse.json({ ok: false, error: 'missing fields' }, { status: 400 });
  }
  if (!['whatsapp', 'telegram', 'email'].includes(channel)) {
    return NextResponse.json({ ok: false, error: 'bad channel' }, { status: 400 });
  }

  const token = randomBytes(18).toString('base64url');

  if (!isDbConfigured()) {
    console.log('[subscribe · stub]', { channel, contact, filters });
    return NextResponse.json({ ok: true, demo: true, confirmToken: token });
  }

  try {
    await createPendingSubscription({ channel, contact, filters: filters ?? {}, confirmToken: token });
    const origin = req.headers.get('origin') ?? 'https://belowop-demo.vercel.app';
    const confirmUrl = `${origin}/api/subscribe/confirm?token=${token}`;

    if (channel === 'whatsapp') {
      await sendWhatsapp(
        contact,
        `Below OP — confirm your alerts.\nReply YES to start receiving alerts, or visit ${confirmUrl} to confirm.`,
      );
    } else if (channel === 'telegram') {
      await sendTelegram(
        contact,
        `*Below OP* — confirm your alerts\\.\n[Tap to confirm](${confirmUrl})`,
        { parseMode: 'MarkdownV2' },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[subscribe] failed', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
