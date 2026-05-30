/**
 * Render the exact alert message a given listing would produce, without
 * actually sending anything or marking events as dispatched. Useful for QA
 * and showing the client what an alert will look like end-to-end.
 *
 *   GET /api/admin/preview-alert?ref=PF-XXXXXXXX
 *   Authorization: Bearer <ADMIN_TOKEN>
 */
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { timingSafeEqual } from 'node:crypto';
import { formatWhatsapp, formatTelegram, brokerWhatsappNumber, type AlertContext } from '@/lib/alert-format';
import { isDbConfigured } from '@/lib/db';
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

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ ok: false, error: 'db not configured' }, { status: 503 });

  const ref = new URL(req.url).searchParams.get('ref');
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
    blob_image_urls: string[] | null;
    source_image_urls: string[] | null;
  }>`
    SELECT external_ref, project, developer, community, sub_location, type, beds, bathrooms, sqft,
           bua_sqft, plot_size_sqft, current_price, original_price, unit_type, features, view, floor_position, handover, payment_status, blob_image_urls, source_image_urls
    FROM listings WHERE external_ref = ${ref} LIMIT 1;
  `;
  const l = r.rows[0];
  if (!l) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

  const delta = dropPct(Number(l.current_price), Number(l.original_price));
  const webUrl = process.env.PUBLIC_WEB_URL ?? 'https://belowop-demo.vercel.app';
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
    current: Number(l.current_price),
    original: Number(l.original_price),
    dropPct: delta,
    webUrl,
  };

  return NextResponse.json({
    ok: true,
    listing: {
      ref: l.external_ref,
      project: l.project,
      community: l.community,
      sub_location: l.sub_location,
      current: Number(l.current_price),
      original: Number(l.original_price),
      drop_pct: delta,
    },
    whatsapp: formatWhatsapp(ctx),
    telegram: formatTelegram(ctx),
    og_card: `${webUrl}/api/og?ref=${l.external_ref}`,
    broker_wa: brokerWhatsappNumber(),
    blob_images: l.blob_image_urls ?? [],
    source_images: l.source_image_urls ?? [],
  });
}
