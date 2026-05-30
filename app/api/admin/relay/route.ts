/**
 * Admin relay endpoint — returns a list of listings ready to manually post
 * to the WhatsApp Channel. Each row includes the rendered caption + OG hero
 * URL. The /admin/relay UI uses this to power a one-click copy + open flow.
 *
 * GET /api/admin/relay?source=pending  → un-dispatched alert_events first
 * GET /api/admin/relay?source=recent   → most recent listings
 *
 * Auth: Authorization: Bearer <ADMIN_TOKEN>
 */
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { timingSafeEqual } from 'node:crypto';
import { formatWhatsapp, type AlertContext } from '@/lib/alert-format';
import { dropPct, opaqueIdFromRef } from '@/lib/format';
import { shortenListing, listingDestination } from '@/lib/dub';

export const dynamic = 'force-dynamic';

function authorize(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Row {
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
  current_price: number;
  original_price: number;
  unit_type: string | null;
  features: string[] | null;
  view: string | null;
  floor_position: string | null;
  handover: string | null;
  payment_status: string | null;
  alert_event_id?: number | null;
  alert_created_at?: string | null;
  dispatched_at?: string | null;
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const source = url.searchParams.get('source') ?? 'pending';
  const webBase = process.env.PUBLIC_WEB_URL ?? `${url.protocol}//${url.host}`;
  const channelUrl = process.env.WHATSAPP_CHANNEL_URL ?? '';

  let rows: Row[];
  if (source === 'recent') {
    const r = await sql<Row>`
      SELECT external_ref, project, developer, community, sub_location, type, beds, bathrooms, sqft,
             bua_sqft, plot_size_sqft, current_price, original_price, unit_type, features, view, floor_position, handover, payment_status,
             NULL::int AS alert_event_id, NULL::text AS alert_created_at, NULL::text AS dispatched_at
      FROM listings
      WHERE withdrawn_at IS NULL
      ORDER BY listed_at DESC
      LIMIT 20;
    `;
    rows = r.rows;
  } else {
    // Pending alerts joined to their listing.
    const r = await sql<Row>`
      SELECT l.external_ref, l.project, l.developer, l.community, l.sub_location, l.type, l.beds, l.bathrooms, l.sqft,
             l.bua_sqft, l.plot_size_sqft, l.current_price, l.original_price, l.unit_type, l.features, l.view, l.floor_position, l.handover, l.payment_status,
             ae.id AS alert_event_id, ae.created_at::text AS alert_created_at, ae.dispatched_at::text AS dispatched_at
      FROM alert_events ae
      JOIN listings l ON l.id = ae.listing_id
      WHERE ae.dispatched_at IS NULL
      ORDER BY ae.created_at DESC
      LIMIT 20;
    `;
    rows = r.rows;
  }

  const items = await Promise.all(rows.map(async (l) => {
    // Mint a trackable Dub short link for the deal CTA, falling back to the
    // long opaque deep link when Dub is unconfigured / errors.
    const opaqueId = opaqueIdFromRef(l.external_ref);
    const deepLink = listingDestination(webBase, opaqueId);
    const dealLink = (await shortenListing({ webBase, opaqueId, title: l.project })) ?? deepLink;
    const ctx: AlertContext = {
      project: l.project,
      community: l.community,
      subLocation: l.sub_location !== l.project ? l.sub_location : null,
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
      current: Number(l.current_price),
      original: Number(l.original_price),
      dropPct: dropPct(Number(l.current_price), Number(l.original_price)),
      webUrl: dealLink,
    };
    // WhatsApp caption: same broker-canonical template, but Telegram-style
    // bold/strike markers (`*text*`) render naturally in WhatsApp too.
    const caption = formatWhatsapp(ctx);
    return {
      ref: l.external_ref,
      project: l.project,
      community: l.community,
      currentPrice: Number(l.current_price),
      dropPct: ctx.dropPct,
      type: l.type,
      handover: l.handover,
      caption,
      ogUrl: `${webBase}/api/og?ref=${encodeURIComponent(l.external_ref)}&v=${l.alert_event_id ?? Date.now()}`,
      alertEventId: l.alert_event_id ?? null,
      alertCreatedAt: l.alert_created_at ?? null,
    };
  }));

  return NextResponse.json({ ok: true, channel_url: channelUrl, source, count: items.length, items });
}
