/**
 * Opaque image proxy.
 *
 * Serves a listing's photos under a same-origin path keyed by the *public*
 * opaque id, so the raw source reference (PF ref) embedded in the underlying
 * Blob / origin-CDN URL never reaches the browser:
 *
 *   blob:   …/listings/PF-XXXXXXXX/3.webp  ← ref in the path
 *   origin: the source platform's image CDN host carries the ref too
 *
 * Public surface only ever sees `/img/{opaqueId}/{idx}` (emitted by
 * `toPublicListing`), which we resolve back to the real URL *server-side* and
 * stream the bytes for. This closes the last raw-ref leak: even though the
 * gallery images were never rendered with the ref as visible text, next/image
 * put the real URL in both the `src` attribute and the `/_next/image?url=…`
 * optimizer query string, exposing ~hundreds of refs via view-source.
 *
 *   GET /img/{opaqueId}/{idx}  → streams the idx-th gallery photo.
 *
 * Resolution: opaque id → listing (DB first via `fetchListingByOpaqueId`, seed
 * fallback via `findByOpaqueId`) → the idx-th entry of its real gallery.
 * Resolved galleries are memoised for a minute per opaque id so we don't
 * re-scan the active refs on every <img> request — next/image fans out one
 * request per responsive width.
 *
 * Why proxy and not redirect: a 302 would put the real ref-bearing URL straight
 * into the `Location` header / network panel, defeating the point. We stream
 * the bytes and stamp an immutable cache header so Vercel's CDN serves repeats
 * without re-invoking us.
 */
import { NextResponse } from 'next/server';
import { fetchListingByOpaqueId, isDbConfigured } from '@/lib/db';
import { findByOpaqueId, type Listing } from '@/lib/listings';
import { imageUrl as unsplashUrl } from '@/lib/format';

// Node runtime: the DB resolver loads the Postgres driver at import time.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per-instance memo of resolved galleries. A listing's gallery is stable, and
// the DB resolver scans the active-ref set (a full ref-column pull) to invert
// the one-way opaque hash, so caching avoids repeating that for every image
// fan-out. Short TTL keeps it from pinning a withdrawn listing for long.
const TTL_MS = 60_000;
const galleryCache = new Map<string, { at: number; urls: string[] }>();

/** The real (server-only) ordered gallery for a resolved listing. */
function galleryOf(l: Listing): string[] {
  if (l.imageUrls?.length) return l.imageUrls;
  if (l.imageUrl) return [l.imageUrl];
  // Legacy seed shape: synthesize the Unsplash URL from the photo id.
  if (l.imageId) return [unsplashUrl(l.imageId, 1600)];
  return [];
}

async function resolveGallery(opaqueId: string): Promise<string[]> {
  const hit = galleryCache.get(opaqueId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.urls;

  let listing: Listing | null = null;
  if (isDbConfigured()) {
    try {
      listing = await fetchListingByOpaqueId(opaqueId);
    } catch {
      listing = null; // fall through to seed
    }
  }
  if (!listing) listing = findByOpaqueId(opaqueId) ?? null;

  const urls = listing ? galleryOf(listing) : [];
  galleryCache.set(opaqueId, { at: Date.now(), urls });
  return urls;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string; idx: string } },
) {
  const { id, idx } = params;
  const i = Number(idx);
  // Opaque ids are always `u-…`; anything else is a probe — reject cheaply
  // before touching the DB.
  if (!id.startsWith('u-') || !Number.isInteger(i) || i < 0) {
    return new NextResponse('bad request', { status: 400 });
  }

  const urls = await resolveGallery(id);
  const target = urls[i];
  if (!target) return new NextResponse('not found', { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(target, { cache: 'no-store' });
  } catch {
    return new NextResponse('upstream fetch failed', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse('upstream error', { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // The bytes behind a given (opaque id, index) never change — a new photo
      // would land at a new index — so they're safe to cache forever. Lets the
      // Vercel CDN + next/image optimizer serve repeats without re-hitting us.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
