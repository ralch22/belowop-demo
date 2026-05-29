/**
 * OG hero card generator — UI.md §4.6.
 *
 * GET /api/og?ref=<external_ref OR opaque-id>
 *
 * Produces a 1200×630 JPEG suitable for:
 *   - Alert hero image (WhatsApp template HEADER, Telegram sendPhoto)
 *   - OpenGraph share preview when /?inquire=u-xxx is shared
 *
 * Layouts:
 *   1 source image → full-bleed
 *   2 source images → 50/50 split
 *   3 source images → 1 large + 2 stacked
 *   4 source images → 4-up filmstrip
 *   0 sources       → text-only brand card with project + price
 *
 * Always overlays: bottom-left brand wordmark on a black gradient strip.
 * Top-right pill: "X% below OP" in brand red.
 *
 * Runs on edge — stateless, ~50ms p95.
 */
import { ImageResponse } from 'next/og';
import { neon } from '@neondatabase/serverless';
import { listings, opaqueOf, findByOpaqueId, findByRef, type Listing } from '@/lib/listings';
import { dropPct } from '@/lib/format';
import { formatAedShort } from '@/lib/description-parser';

export const runtime = 'edge';

const BRAND_TEAL = '#0F766E';
const DROP_RED = '#B91C1C';

interface DbListingRow {
  external_ref: string;
  project: string;
  developer: string | null;
  community: string;
  sub_location: string | null;
  type: 'off_plan' | 'ready';
  beds: string;
  sqft: number;
  current_price: number;
  original_price: number;
  unit_type: string | null;
  blob_image_urls: string[] | null;
  source_image_urls: string[] | null;
}

function imgUrl(id: string, w = 800) {
  return `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;
}

/**
 * Resolve listing data, preferring Postgres for real PF refs (PF-9XXXXXXX)
 * and falling back to the seed JSON for the legacy fixture refs (PF-440XX).
 *
 * Uses Neon's HTTP driver — works in edge runtime, read-only, no
 * read-after-write surprises for this lookup.
 */
async function resolveListing(ref: string): Promise<{ listing: Listing; alternateImages: string[] }> {
  // Opaque IDs → seed lookup (alert-preview etc. produce these).
  if (ref.startsWith('u-')) {
    const seed = findByOpaqueId(ref);
    if (seed) return { listing: seed, alternateImages: [] };
  }

  // Try the DB first via the HTTP driver — works in edge runtime.
  const connStr = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (connStr) {
    try {
      const sql = neon(connStr);
      const rows = (await sql`
        SELECT external_ref, project, developer, community, sub_location, type, beds, sqft,
               current_price, original_price, unit_type, blob_image_urls, source_image_urls
        FROM listings WHERE external_ref = ${ref} LIMIT 1
      `) as DbListingRow[];
      const r = rows[0];
      if (r) {
        // next/og's image renderer (satori) supports JPEG/PNG natively but
        // NOT WebP. Our Blob files are WebP transcodes; the source PF CDN
        // URLs are JPEG. Prefer source for OG generation, fall back to Blob.
        // Trade-off: we hit PF CDN once per OG render. Telegram caches the
        // resulting composite, so each unique listing → 1 PF CDN hit total.
        const source = r.source_image_urls ?? [];
        const blob = r.blob_image_urls ?? [];
        const imgs = [...source, ...blob.filter((b) => !source.includes(b))];
        const primary = imgs[0] ?? '';
        // Map DB row to the Listing shape. Note: many real PF listings have
        // project == sub_location (azzouzana's location_tree only goes 3
        // levels deep), so the headline rendering must dedup these.
        const listing: Listing = {
          ref: r.external_ref,
          project: r.project,
          unit: '',
          developer: r.developer ?? '',
          community: r.community,
          subLocation: r.sub_location !== r.project ? r.sub_location : null,
          type: r.type,
          beds:
            r.beds === 'studio'
              ? 'studio'
              : r.beds === '4+'
                ? '4+'
                : Number.isFinite(Number(r.beds))
                  ? Number(r.beds)
                  : 'studio', // unparseable → safe fallback (never NaN)
          sqft: r.sqft,
          currentPrice: Number(r.current_price),
          originalPrice: Number(r.original_price),
          listedAt: new Date().toISOString(),
          imageId: '',
          imageUrl: primary,
          unitType: r.unit_type,
        };
        // alternateImages are this listing's own additional images (not
        // a cycle through other seed listings — that was the bug).
        return { listing, alternateImages: imgs.slice(1, 4) };
      }
    } catch (e) {
      console.error('[og] DB lookup failed', e);
      // fall through to seed
    }
  }

  // Final fallback: seed lookup, then seed[0].
  const seed = findByRef(ref) ?? listings[0];
  return { listing: seed, alternateImages: [] };
}

/**
 * Pre-fetch each image URL ourselves and return as `data:` URIs. This bypasses
 * next/og's built-in image loader, which fails on some hosts (notably the
 * PropertyFinder CDN — likely UA filtering, fetched with a generic node UA).
 *
 * We use a browser-like User-Agent and a short timeout. Failed images are
 * dropped from the result rather than crashing the whole card.
 */
async function inlineImages(urls: string[]): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const results = await Promise.all(
      urls.slice(0, 4).map(async (u) => {
        try {
          const r = await fetch(u, {
            signal: ctrl.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; BelowOP-OG/1.0; +https://belowop.ae)',
              Accept: 'image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5',
            },
          });
          if (!r.ok) return null;
          const ct = r.headers.get('content-type') ?? 'image/jpeg';
          if (!ct.startsWith('image/') || ct.includes('webp')) return null; // next/og can't handle webp
          const buf = new Uint8Array(await r.arrayBuffer());
          // Convert to base64 in chunks to avoid call-stack issues on big files.
          let bin = '';
          const CHUNK = 0x8000;
          for (let i = 0; i < buf.length; i += CHUNK) {
            bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
          }
          return `data:${ct};base64,${btoa(bin)}`;
        } catch {
          return null;
        }
      }),
    );
    return results.filter((x): x is string => Boolean(x));
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = url.searchParams.get('ref') ?? '';
  const { listing, alternateImages } = await resolveListing(ref);

  const primary = listing.imageUrl ?? imgUrl(listing.imageId, 1600);
  // Pad to up to 4 images: this listing's primary + alternates from same
  // listing. If real listing has only 1-2 images, we just render the smaller
  // layout (full-bleed or 50/50 split).
  const rawImageUrls = [primary, ...alternateImages].filter(Boolean) as string[];
  // Pre-fetch + inline as data URIs. Skips next/og's built-in loader, which
  // fails for hosts that block its default UA (PF CDN, possibly others).
  const imageIds = await inlineImages(rawImageUrls);

  // FIX-01: only show the drop pill when a real Original Price is known. DB
  // rows with no parsed OP arrive here as 0 (Number(null)); dropPct on those
  // yields Infinity, so guard before rendering "…% below OP".
  const op = listing.originalPrice;
  const opKnown = Number.isFinite(op) && op > 0 && op !== listing.currentPrice;
  const delta = opKnown ? dropPct(listing.currentPrice, op) : null;
  const dropLabel = delta !== null ? `${Math.abs(delta).toFixed(0)}% below OP` : null;
  // "Project, Area" per Variables.pdf. Dedup if community already appears in
  // the project name (e.g. "Morocco Phase 2" in Damac Lagoons → don't double up).
  const project = listing.project.trim();
  const community = (listing.community ?? '').trim();
  const headline = !community || project.toLowerCase().includes(community.toLowerCase())
    ? project
    : `${project}, ${community}`;
  const facts = [
    listing.unitType ??
      (listing.beds === 'studio'
        ? 'Studio'
        : listing.beds === '4+'
          ? '4+ Bedroom'
          : Number.isFinite(listing.beds as number)
            ? `${listing.beds} Bedroom`
            : 'Apartment'),
    `${listing.sqft.toLocaleString()} sqft`,
    // Show sub-location as the third fact slot if we have one and it's not in headline
    listing.subLocation && !headline.toLowerCase().includes(listing.subLocation.toLowerCase()) ? listing.subLocation : null,
  ].filter(Boolean).join(' · ');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0F172A',
          fontFamily: 'Inter, system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Image collage */}
        <div style={{ display: 'flex', flex: 1, gap: 4, padding: 4, background: 'white' }}>
          {imageIds.length === 1 && (
            <img src={imageIds[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {imageIds.length === 2 && imageIds.map((src, i) => (
            <img key={i} src={src} style={{ width: '50%', height: '100%', objectFit: 'cover' }} />
          ))}
          {imageIds.length === 3 && (
            <>
              <img src={imageIds[0]} style={{ width: '60%', height: '100%', objectFit: 'cover' }} />
              <div style={{ display: 'flex', flexDirection: 'column', width: '40%', gap: 4 }}>
                <img src={imageIds[1]} style={{ width: '100%', height: '50%', objectFit: 'cover' }} />
                <img src={imageIds[2]} style={{ width: '100%', height: '50%', objectFit: 'cover' }} />
              </div>
            </>
          )}
          {imageIds.length >= 4 && imageIds.slice(0, 4).map((src, i) => (
            <img key={i} src={src} style={{ width: '25%', height: '100%', objectFit: 'cover' }} />
          ))}
        </div>

        {/* Top-right drop pill — only when a real OP is known */}
        {dropLabel && (
          <div
            style={{
              position: 'absolute',
              top: 28,
              right: 28,
              background: DROP_RED,
              color: 'white',
              padding: '12px 24px',
              borderRadius: 999,
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: -0.5,
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
            }}
          >
            {dropLabel}
          </div>
        )}

        {/* Bottom overlay strip */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 200,
            background: 'linear-gradient(to top, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.85) 50%, rgba(15,23,42,0) 100%)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 36,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: BRAND_TEAL,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 800,
                  color: 'white',
                }}
              >
                B
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>
                BELOW OP
              </span>
              <span style={{ fontSize: 18, color: '#94A3B8', marginLeft: 6 }}>
                · Distress deals, Dubai
              </span>
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>
              {headline}
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 22, color: '#CBD5E1' }}>
              <span>{facts}</span>
              <span style={{ marginLeft: 'auto', color: 'white', fontWeight: 700 }}>
                {formatAedShort(listing.currentPrice)} AED
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'cache-control': 'public, immutable, no-transform, max-age=86400, s-maxage=86400',
      },
    },
  );
}
