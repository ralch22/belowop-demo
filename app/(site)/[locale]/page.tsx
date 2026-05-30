import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import ListingsView from '@/components/ListingsView';
import { listings as seedListings, toPublicListing, type PublicListing } from '@/lib/listings';
import { fetchListings, ingestionFreshness, isDbConfigured } from '@/lib/db';

export const revalidate = 60; // ISR — refresh listing data every 60s.

async function loadListings(): Promise<{
  // CRITICAL (privacy): this page is the server→client chokepoint. We hand the
  // client PublicListing[] — the raw PF ref is stripped here via
  // toPublicListing and never enters the hydration payload. The opaque id is
  // the only listing identifier the browser ever sees.
  listings: PublicListing[];
  source: 'db' | 'seed';
  lastIngestAt: string | null;
}> {
  // Only fall back to seed JSON when the DB isn't configured at all (local dev /
  // pre-provisioning state). Once the DB is connected we trust its truth — even
  // an empty DB renders the empty state rather than reverting to fake data.
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
        console.error('[home] freshness fetch failed:', e);
        return null;
      }),
    ]);
    return {
      listings: rows.map(toPublicListing),
      source: 'db',
      lastIngestAt: freshness?.last_success_at ?? null,
    };
  } catch (e) {
    console.error('[home] DB fetch failed:', e);
    return { listings: [], source: 'db', lastIngestAt: null };
  }
}

export default async function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  // Opt this page into static rendering for the active locale (next-intl).
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const { listings, source, lastIngestAt } = await loadListings();
  return (
    <Suspense fallback={<div className="mx-auto max-w-content px-4 py-12 text-sm text-slate-500">{t('loading')}</div>}>
      <ListingsView initialListings={listings} dataSource={source} lastIngestAt={lastIngestAt} />
    </Suspense>
  );
}
