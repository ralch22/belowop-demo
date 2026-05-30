/**
 * Admin click-analytics for a listing's Dub short link.
 *
 *   GET /api/admin/dub?ref=PF-XXXXXXXX      (admin holds the raw ref)
 *   GET /api/admin/dub?id=u-xxxxxxxx        (already-opaque id)
 *   Authorization: Bearer <ADMIN_TOKEN>
 *
 * Returns the lifetime click count for the listing's Dub short link. Dub's
 * analytics API requires a Pro plan; on a free plan (or when DUB_API_KEY is
 * unset) we surface that gracefully as ok:false rather than 500-ing.
 *
 * PRIVACY: the opaque id is what Dub stores as externalId; if a raw ref is
 * passed it is hashed server-side and never forwarded. The response echoes the
 * opaque id only — never the raw ref.
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getListingClicks, isDubConfigured } from '@/lib/dub';
import { opaqueIdFromRef } from '@/lib/format';

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

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!isDubConfigured()) {
    return NextResponse.json({ ok: false, error: 'dub not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const ref = url.searchParams.get('ref');
  const id = url.searchParams.get('id');
  const interval = url.searchParams.get('interval') ?? 'all';
  // Resolve to the opaque id: hash a raw ref server-side, or take a passed id.
  const opaqueId = ref ? opaqueIdFromRef(ref) : id;
  if (!opaqueId) {
    return NextResponse.json({ ok: false, error: 'ref or id required' }, { status: 400 });
  }

  const r = await getListingClicks(opaqueId, interval);
  if (!r.ok) {
    // Non-Pro plan / upstream error — bubble up as 502 so it's visibly degraded,
    // never a hard crash. The opaque id is still echoed for correlation.
    return NextResponse.json(
      { ok: false, opaque_id: opaqueId, interval, error: r.error ?? 'analytics unavailable', status: r.status },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, opaque_id: opaqueId, interval, clicks: r.clicks ?? 0 });
}
