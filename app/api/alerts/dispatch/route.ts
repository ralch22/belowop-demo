/**
 * Alerts dispatcher — runs on Vercel Cron.
 *
 * Pops pending alert_events, formats them with the broker canonical template
 * (see Variables.pdf, lib/alert-format.ts), and sends to WhatsApp + Telegram
 * subscribers respecting filters and throttling (CLAUDE.md §7.7).
 */
import { NextResponse } from 'next/server';
import {
  pendingAlertEvents,
  markAlertDispatched,
  activeSubscriptions,
  isDbConfigured,
} from '@/lib/db';
import { sql } from '@/lib/db';
import { sendWhatsapp } from '@/lib/twilio';
import { sendTelegram } from '@/lib/telegram';
import { rateLimit } from '@/lib/kv';
import { formatWhatsapp, formatTelegram, type AlertContext } from '@/lib/alert-format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function matchesFilter(filters: Record<string, unknown>, l: { type: string; community: string; current: number; dropPct: number }): boolean {
  if (filters.type && filters.type !== 'any' && filters.type !== l.type) return false;
  if (filters.areas && Array.isArray(filters.areas) && filters.areas.length > 0) {
    if (!filters.areas.includes(l.community)) return false;
  }
  if (filters.maxPrice && Number(filters.maxPrice) > 0 && l.current > Number(filters.maxPrice)) return false;
  if (filters.minDropPct && Math.abs(l.dropPct) < Number(filters.minDropPct)) return false;
  return true;
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ ok: true, skipped: 'db not configured' });

  const events = await pendingAlertEvents(25);
  const subs = await activeSubscriptions();
  const stats = { events: events.length, sent: 0, skipped: 0, errors: 0 };
  const webBase = process.env.PUBLIC_WEB_URL ?? 'https://belowop-demo.vercel.app';

  for (const event of events) {
    try {
      const lookup = await sql<{
        external_ref: string;
        project: string;
        developer: string | null;
        community: string;
        sub_location: string | null;
        type: 'off_plan' | 'ready';
        beds: string;
        bathrooms: number | null;
        sqft: number;
        original_price: number;
        unit_type: string | null;
        features: string[];
        view: string | null;
        floor_position: string | null;
        handover: string | null;
        payment_status: string | null;
      }>`SELECT external_ref, project, developer, community, sub_location, type, beds, bathrooms, sqft,
                original_price, unit_type, features, view, floor_position, handover, payment_status
         FROM listings WHERE id = ${event.listing_id};`;
      const l = lookup.rows[0];
      if (!l) {
        await markAlertDispatched(event.id, 'listing missing');
        stats.skipped++;
        continue;
      }

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
        current: Number(event.new_price),
        original: Number(l.original_price),
        dropPct: Number(event.drop_pct ?? 0),
        webUrl: webBase,
      };

      const wa = formatWhatsapp(ctx);
      const tg = formatTelegram(ctx);
      // Build the OG hero card URL. We tag with the alert_event's id so each
      // event gets a unique URL — Telegram caches photo URLs forever, and
      // without this we'd see the same image every time a listing alerts again.
      // Telegram captions cap at 1024 chars; strip the photo if body exceeds.
      const ogPhotoUrl = `${webBase}/api/og?ref=${encodeURIComponent(l.external_ref)}&v=${event.id}`;
      const tgPhotoUrl = tg.length <= 1024 ? ogPhotoUrl : undefined;

      const fctx = {
        type: l.type,
        community: l.community,
        current: ctx.current,
        dropPct: ctx.dropPct,
      };

      const eligible = subs.filter((s) => matchesFilter(s.filters ?? {}, fctx));
      for (const s of eligible) {
        // SRS-FR-67: throttle WhatsApp alerts to max 1 per recipient per 30 min
        // AND max 5 per day. Telegram channel posts are NOT capped here (those
        // are 1:N broadcast, the per-day cap is on direct subscriber DMs only).
        const dailyKey = `alert:rl:day:${s.channel}:${s.contact}`;
        const burstKey = `alert:rl:30m:${s.channel}:${s.contact}`;
        const daily = await rateLimit(dailyKey, 5, 60 * 60 * 24);
        if (!daily.allowed) {
          stats.skipped++;
          continue;
        }
        const burst = await rateLimit(burstKey, 1, 60 * 30);
        if (!burst.allowed) {
          stats.skipped++;
          continue;
        }
        if (s.channel === 'whatsapp') {
          // For WhatsApp we already pass mediaUrl as the third arg in sendWhatsapp.
          const r = await sendWhatsapp(s.contact, wa, ogPhotoUrl);
          if (r.ok) stats.sent++;
          else stats.errors++;
        } else if (s.channel === 'telegram') {
          const r = await sendTelegram(s.contact, tg, { parseMode: 'MarkdownV2', photoUrl: tgPhotoUrl });
          if (r.ok) stats.sent++;
          else stats.errors++;
        }
      }

      const channelId = process.env.TELEGRAM_CHANNEL_ID;
      if (channelId) {
        const r = await sendTelegram(channelId, tg, { parseMode: 'MarkdownV2', photoUrl: tgPhotoUrl });
        if (r.ok) stats.sent++;
      }

      await markAlertDispatched(event.id);
    } catch (e) {
      console.error('[alerts/dispatch] event', event.id, e);
      await markAlertDispatched(event.id, (e as Error).message?.slice(0, 200));
      stats.errors++;
    }
  }

  return NextResponse.json({ ok: true, stats });
}
