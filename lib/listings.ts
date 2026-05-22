import raw from '@/data/listings.json';
import { dropPct, opaqueIdFromRef } from './format';

export type ListingType = 'off_plan' | 'ready';
export type Beds = number | 'studio';

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

export function applyFilters(items: Listing[], f: Filters): Listing[] {
  let r = items.slice();
  if (f.type && f.type !== 'all') r = r.filter((l) => l.type === f.type);
  if (f.beds && f.beds !== 'any') {
    r = r.filter((l) => {
      if (f.beds === 'studio') return l.beds === 'studio';
      if (f.beds === '4+') return typeof l.beds === 'number' && l.beds >= 4;
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
