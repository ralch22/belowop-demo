import { listings as seedListings, toPublicListing, type PublicListing } from '@/lib/listings';
import { fetchListings, ingestionFreshness, isDbConfigured } from '@/lib/db';

export interface LoadedListings {
  // CRITICAL (privacy): this is the server→client chokepoint. Callers hand the
  // client PublicListing[] — the raw PF ref is stripped here via toPublicListing
  // and never enters the hydration payload. The opaque id is the only listing
  // identifier the browser ever sees.
  listings: PublicListing[];
  source: 'db' | 'seed';
  lastIngestAt: string | null;
}

/**
 * Load the public listing set for any server page (home and /search both use
 * this). Falls back to seed JSON only when the DB isn't configured at all
 * (local dev / pre-provisioning); once the DB is connected we trust its truth,
 * so an empty DB renders the empty state rather than reverting to fake data.
 */
export async function loadListings(): Promise<LoadedListings> {
  if (!isDbConfigured()) {
    return { listings: seedListings.map(toPublicListing), source: 'seed', lastIngestAt: null };
  }
  try {
    // Pull listings and the ingestion-freshness headline in parallel. The
    // freshness query is best-effort: if it fails we still render listings and
    // the pill quietly falls back to the newest listing's publication date.
    const [rows, freshness] = await Promise.all([
      fetchListings(500),
      ingestionFreshness().catch((e) => {
        console.error('[load-listings] freshness fetch failed:', e);
        return null;
      }),
    ]);
    return {
      listings: rows.map(toPublicListing),
      source: 'db',
      lastIngestAt: freshness?.last_success_at ?? null,
    };
  } catch (e) {
    console.error('[load-listings] DB fetch failed:', e);
    return { listings: [], source: 'db', lastIngestAt: null };
  }
}
