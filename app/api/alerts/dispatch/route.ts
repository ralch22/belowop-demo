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
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Accept three callers:
 *   1. Vercel cron (header x-vercel-cron: 1) — automatic daily fire
 *   2. CRON_SECRET Bearer — legacy curl path
 *   3. ADMIN_TOKEN via ?token=… or Authorization: Bearer — manual ops
 */
function authorize(req: Request): boolean {
  // (1) Vercel cron — trusted infra header.
  if (req.headers.get('x-vercel-cron') === '1') return true;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token');
  const headerBearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const provided = queryToken || headerBearer;
  if (!provided) return false;

  // Constant-time compare against either CRON_SECRET or ADMIN_TOKEN.
  for (const envVar of ['CRON_SECRET', 'ADMIN_TOKEN'] as const) {
    const expected = process.env[envVar];
    if (!expected) continue;
    try {
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // fall through
    }
  }
  return false;
}

/**
 * Mark all currently pending alert_events as dispatched WITHOUT firing.
 * Useful for the one-time backlog cleanup after the initial mass ingestion —
 * avoids dumping 254 events into the Telegram channel at once.
 *
 * Use: ?action=mark-baseline (admin auth required)
 */
async function markBaseline(): Promise<{ marked: number }> {
  const r = await sql`
    UPDATE alert_events
    SET dispatched_at = NOW(), dispatch_error = NULL
    WHERE dispatched_at IS NULL
    RETURNING id;
  `;
  return { marked: r.rowCount ?? 0 };
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

  // Optional escape hatch: mark all pending events as dispatched without
  // actually firing them. Used to clear the backlog after the initial
  // mass ingest so future runs only fire on NEW data.
  const action = new URL(req.url).searchParams.get('action');
  if (action === 'mark-baseline') {
    const result = await markBaseline();
    return NextResponse.json({ ok: true, action: 'mark-baseline', ...result });
  }

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
        bua_sqft: number | null;
        plot_size_sqft: number | null;
        original_price: number;
        unit_type: string | null;
        features: string[];
        view: string | null;
        floor_position: string | null;
        handover: string | null;
        payment_status: string | null;
      }>`SELECT external_ref, project, developer, community, sub_location, type, beds, bathrooms, sqft,
                bua_sqft, plot_size_sqft, original_price, unit_type, features, view, floor_position, handover, payment_status
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
        buaSqft: l.bua_sqft,
        plotSqft: l.plot_size_sqft,
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
