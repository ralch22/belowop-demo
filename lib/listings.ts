import raw from '@/data/listings.json';
import { dropPct, opaqueIdFromRef, formatAED } from './format';

export type ListingType = 'off_plan' | 'ready';
export type Beds = number | 'studio' | '4+';

export interface Listing {
  ref: string;
  project: string;
  unit: string;
  developer: string;
  community: string;
  type: ListingType;
  beds: Beds;
  sqft: number;
  currentPrice: number;
  originalPrice: number;
  listedAt: string;
  /** Legacy field for seeded data — used to build Unsplash URLs on demand. */
  imageId: string;
  /** Preferred when present — points at the Blob or source CDN directly. */
  imageUrl?: string | null;
  /** Full gallery (Blob preferred, source CDN fallback). First entry === imageUrl. */
  imageUrls?: string[];
  // Broker template fields (Variables.pdf) — all optional.
  unitType?: string | null;
  bathrooms?: number | null;
  view?: string | null;
  floorPosition?: string | null;
  features?: string[] | null;
  handover?: string | null;
  paymentStatus?: string | null;
  plotSizeSqft?: number | null;
  buaSqft?: number | null;
  subLocation?: string | null;
  furnished?: string | null;
}

/**
 * The shape we hand to the browser. CRITICAL (privacy): this is a `Listing`
 * with the raw source reference (`ref`) stripped out and replaced by the
 * non-reversible opaque id. The buyer-facing client components, the hydration
 * payload, and any `?inquire=` URL only ever see `opaqueId` — the real PF ref
 * never leaves the server. Map server `Listing`s through `toPublicListing`
 * before passing them into a `'use client'` boundary.
 */
export type PublicListing = Omit<Listing, 'ref'> & { opaqueId: string };

/**
 * Strip the source ref and attach the opaque id. This is the single chokepoint
 * that turns a server-only `Listing` into a browser-safe `PublicListing`.
 *
 * It also rewrites every image field to the same-origin opaque proxy
 * (`/img/{opaqueId}/{i}`, served by app/img/[id]/[idx]/route.ts). The real
 * Blob / source-CDN URLs embed the PF ref in their path/host
 * (`…/listings/PF-XXXXXXXX/3.webp`, `static.shared.propertyfinder.ae/…`), and
 * next/image would otherwise leak that ref in both the `src` attribute and the
 * `/_next/image?url=…` optimizer query string. Listings that carry no real
 * image URLs (legacy seed shape: an Unsplash `imageId` only) hold no ref and
 * are passed through untouched.
 */
export function toPublicListing(l: Listing): PublicListing {
  // Pull `ref` out so it is never spread into the public object.
  const { ref, ...rest } = l;
  const opaqueId = opaqueIdFromRef(ref);

  // The real, ref-bearing gallery as the server sees it.
  const realGallery = rest.imageUrls?.length
    ? rest.imageUrls
    : rest.imageUrl
      ? [rest.imageUrl]
      : [];

  if (realGallery.length > 0) {
    const proxied = realGallery.map((_, i) => `/img/${opaqueId}/${i}`);
    return {
      ...rest,
      opaqueId,
      imageId: '', // no Unsplash fallback once we have a proxied gallery
      imageUrl: proxied[0],
      imageUrls: proxied,
    };
  }

  return { ...rest, opaqueId };
}

// Seed data — used as fallback when the DB is empty / unconfigured, and by
// server-rendered pages that don't have access to a live query (e.g. alert-preview).
export const listings: Listing[] = raw as Listing[];

/**
 * Build opaque-ID ↔ ref maps for a given collection of listings.
 * Use this when the data is loaded at runtime (e.g. from Postgres).
 */
export function buildOpaqueMaps(items: Listing[]) {
  const refToOpaque = new Map<string, string>();
  const opaqueToRef = new Map<string, string>();
  items.forEach((l) => {
    const o = opaqueIdFromRef(l.ref);
    refToOpaque.set(l.ref, o);
    opaqueToRef.set(o, l.ref);
  });
  return {
    opaqueOf(ref: string) {
      return refToOpaque.get(ref) ?? opaqueIdFromRef(ref);
    },
    findByOpaqueId(opaque: string): Listing | undefined {
      const ref = opaqueToRef.get(opaque);
      if (!ref) return undefined;
      return items.find((l) => l.ref === ref);
    },
  };
}

// Static maps over the seed data — used by alert-preview and any code path
// that doesn't have a runtime list.
const seedMaps = buildOpaqueMaps(listings);
export const opaqueOf = seedMaps.opaqueOf;
export const findByOpaqueId = seedMaps.findByOpaqueId;

export function findByRef(ref: string): Listing | undefined {
  return listings.find((l) => l.ref === ref);
}

/**
 * Build the WhatsApp enquiry message a buyer sends to Jad.
 *
 * SECURITY/PRIVACY: this MUST NOT contain the raw source reference
 * (listing.ref). Buyers paste this into WhatsApp, so the only identifier we
 * expose is the opaque internal id (same `u-xxxxxx` used in the public URL),
 * which Jad and we can map back to the real listing on our side.
 */
export function buildEnquiryText(
  listing: { project: string; currentPrice: number; opaqueId?: string; ref?: string },
  heading?: string,
): string {
  // Prefer the already-computed opaque id (PublicListing). Fall back to hashing
  // a raw ref only for server-side callers that still hold a full Listing.
  const id = listing.opaqueId ?? (listing.ref ? opaqueIdFromRef(listing.ref) : '');
  const title = heading ?? listing.project;
  return `Hi Jad, I'm interested in ${title} (Ref: ${id}) — AED ${formatAED(
    listing.currentPrice,
  )}. Is it still available?`;
}

export const allCommunities = Array.from(new Set(listings.map((l) => l.community))).sort();
export const allDevelopers = Array.from(new Set(listings.map((l) => l.developer))).sort();

export interface Filters {
  type?: 'all' | ListingType;
  beds?: 'any' | 'studio' | '1' | '2' | '3' | '4+';
  community?: string;
  developer?: string;
  minDropPct?: number;
  maxPrice?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'drop_desc' | 'ppsqm_asc';
}

// SRS-FR-23: URL params ↔ Filters round-trip.
//
// Why this lives here (not in the component): the serialization shape is
// part of the public URL contract — buyers share `/?type=ready&drop=10`
// links, so changes need a test. Keeping the conversion pure makes it
// fast to unit-test without spinning up Next router + JSDOM.

/**
 * Read filter state from a URLSearchParams.
 * - Unknown query keys are ignored.
 * - Numeric coercion: `drop` and `max` are passed through `Number()`; NaN
 *   collapses to undefined so we don't break `applyFilters`.
 * - All other keys passthrough as strings; the consumer enforces types.
 */
export function filtersFromParams(p: URLSearchParams): Filters {
  const numOrUndef = (raw: string | null): number | undefined => {
    if (raw === null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    type: (p.get('type') as Filters['type']) ?? 'all',
    beds: (p.get('beds') as Filters['beds']) ?? 'any',
    community: p.get('area') ?? undefined,
    developer: p.get('dev') ?? undefined,
    minDropPct: numOrUndef(p.get('drop')),
    maxPrice: numOrUndef(p.get('max')),
    sort: (p.get('sort') as Filters['sort']) ?? 'newest',
  };
}

/**
 * Apply a partial Filters update to an existing URLSearchParams, mutating
 * the params object in place. "Default" values (all/any/0/undefined/empty)
 * are deleted from the params so the URL stays clean — `/` rather than
 * `/?type=all&beds=any&drop=0`.
 *
 * Returns the same params object for convenient chaining.
 */
export function paramsFromFilters(params: URLSearchParams, next: Partial<Filters>): URLSearchParams {
  // Per-key default — anything matching this strips the key from the URL so
  // the canonical empty URL is just `/`, not `/?type=all&sort=newest&...`.
  const defaultFor: Record<string, string | number | undefined> = {
    type: 'all',
    beds: 'any',
    sort: 'newest',
  };
  const apply = (k: string, v: string | number | undefined | null) => {
    if (
      v === undefined ||
      v === null ||
      v === '' ||
      v === 0 ||
      v === defaultFor[k]
    ) {
      params.delete(k);
    } else {
      params.set(k, String(v));
    }
  };
  if ('type' in next) apply('type', next.type);
  if ('beds' in next) apply('beds', next.beds);
  if ('community' in next) apply('area', next.community);
  if ('developer' in next) apply('dev', next.developer);
  if ('minDropPct' in next) apply('drop', next.minDropPct);
  if ('maxPrice' in next) apply('max', next.maxPrice);
  if ('sort' in next) apply('sort', next.sort);
  return params;
}

// applyFilters only ever reads the comparable/sortable fields, never `ref`, so
// it works for both the server-side Listing[] and the ref-stripped
// PublicListing[] we hand the browser. Generic over a minimal field set so both
// satisfy the constraint without a cast.
type SortableListing = Pick<
  Listing,
  'type' | 'beds' | 'community' | 'developer' | 'currentPrice' | 'originalPrice' | 'sqft' | 'listedAt'
>;

export function applyFilters<T extends SortableListing>(items: T[], f: Filters): T[] {
  let r = items.slice();
  if (f.type && f.type !== 'all') r = r.filter((l) => l.type === f.type);
  if (f.beds && f.beds !== 'any') {
    r = r.filter((l) => {
      if (f.beds === 'studio') return l.beds === 'studio';
      if (f.beds === '4+') return l.beds === '4+' || (typeof l.beds === 'number' && l.beds >= 4);
      return String(l.beds) === f.beds;
    });
  }
  if (f.community) r = r.filter((l) => l.community === f.community);
  if (f.developer) r = r.filter((l) => l.developer === f.developer);
  if (f.maxPrice) r = r.filter((l) => l.currentPrice <= f.maxPrice!);
  if (f.minDropPct !== undefined) {
    r = r.filter((l) => dropPct(l.currentPrice, l.originalPrice) <= -Math.abs(f.minDropPct!));
  }
  switch (f.sort ?? 'newest') {
    case 'newest':
      r.sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime());
      break;
    case 'price_asc':
      r.sort((a, b) => a.currentPrice - b.currentPrice);
      break;
    case 'price_desc':
      r.sort((a, b) => b.currentPrice - a.currentPrice);
      break;
    case 'drop_desc':
      r.sort(
        (a, b) =>
          dropPct(a.currentPrice, a.originalPrice) - dropPct(b.currentPrice, b.originalPrice),
      );
      break;
    case 'ppsqm_asc':
      r.sort((a, b) => a.currentPrice / a.sqft - b.currentPrice / b.sqft);
      break;
  }
  return r;
}
