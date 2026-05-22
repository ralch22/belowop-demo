import { Suspense } from 'react';
import ListingsView from '@/components/ListingsView';
import { listings as seedListings, type Listing } from '@/lib/listings';
import { fetchListings, isDbConfigured } from '@/lib/db';

export const revalidate = 60; // ISR — refresh listing data every 60s.

async function loadListings(): Promise<{ listings: Listing[]; source: 'db' | 'seed' }> {
  // Only fall back to seed JSON when the DB isn't configured at all (local dev /
  // pre-provisioning state). Once the DB is connected we trust its truth — even
  // an empty DB renders the empty state rather than reverting to fake data.
  if (!isDbConfigured()) return { listings: seedListings, source: 'seed' };
  try {
    const rows = await fetchListings(500);
    return { listings: rows, source: 'db' };
  } catch (e) {
    console.error('[home] DB fetch failed:', e);
    return { listings: [], source: 'db' };
  }
}

export default async function HomePage() {
  const { listings, source } = await loadListings();
  return (
    <Suspense fallback={<div className="mx-auto max-w-content px-4 py-12 text-sm text-slate-500">Loading listings…</div>}>
      <ListingsView initialListings={listings} dataSource={source} />
    </Suspense>
  );
}
