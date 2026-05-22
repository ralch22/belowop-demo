/**
 * Admin parse-test endpoint — paste a listing's title + description, get the
 * full parsed shape back. Lets Rami sanity-check the parser against real
 * broker copy without running an actor.
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  parseOp,
  parseHandover,
  parseView,
  parseFloor,
  parsePaymentStatus,
  parseBua,
  parsePlotSize,
  composeUnitType,
  extractFeatures,
  formatAedShort,
  formatUsdShort,
} from '@/lib/description-parser';

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
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? '');
  const description = String(body.description ?? '');
  const currentPrice = Number(body.currentPrice ?? 0) || undefined;
  const beds = String(body.beds ?? '2');
  const propertyType = String(body.propertyType ?? 'Apartment');
  const amenities: string[] = Array.isArray(body.amenities) ? body.amenities : [];

  const haystack = [title, description].filter(Boolean).join('\n\n');
  const opParse = parseOp(haystack, currentPrice);
  const view = parseView(haystack);
  const floorPosition = parseFloor(haystack);
  const handover = parseHandover(haystack);
  const paymentStatus = parsePaymentStatus(haystack);
  const bua = parseBua(haystack);
  const plot = parsePlotSize(haystack);
  const unitType = composeUnitType({ beds, propertyType, description: haystack });
  const features = extractFeatures({ amenities, description: haystack, view, floorPosition });

  return NextResponse.json({
    ok: true,
    parsed: {
      op: opParse,
      view,
      floorPosition,
      handover,
      paymentStatus,
      buaSqft: bua,
      plotSizeSqft: plot,
      unitType,
      features,
    },
    derived: currentPrice ? {
      aedShort: formatAedShort(currentPrice),
      usdShort: formatUsdShort(currentPrice),
    } : null,
  });
}
