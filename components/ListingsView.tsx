'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  applyFilters,
  buildOpaqueMaps,
  filtersFromParams,
  paramsFromFilters,
  type Filters,
  type Listing,
} from '@/lib/listings';
import { relativeTime } from '@/lib/format';
import FilterBar from './FilterBar';
import ListingTable from './ListingTable';
import ListingCard from './ListingCard';
import ActiveFilters from './ActiveFilters';
import Pagination from './Pagination';
import LeadModal from './LeadModal';
import Toast from './Toast';
import Link from 'next/link';
import { Bell } from 'lucide-react';

// SRS-FR-24: paginate the public table 25 per page.
const PAGE_SIZE = 25;

// Per-key default values — used to clear a filter via the chip strip.
const FILTER_DEFAULTS: Partial<Filters> = {
  type: 'all',
  beds: 'any',
  community: undefined,
  developer: undefined,
  minDropPct: undefined,
  maxPrice: undefined,
};

export default function ListingsView({
  initialListings,
  dataSource = 'seed',
}: {
  initialListings: Listing[];
  dataSource?: 'db' | 'seed';
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  // Build opaque-ID lookup over whatever data we received from the server.
  const { opaqueOf, findByOpaqueId } = useMemo(
    () => buildOpaqueMaps(initialListings),
    [initialListings],
  );

  const filters = useMemo(() => filtersFromParams(new URLSearchParams(search.toString())), [search]);
  const inquireParam = search.get('inquire');
  const activeListing = inquireParam ? findByOpaqueId(inquireParam) : undefined;

  const filtered = useMemo(() => applyFilters(initialListings, filters), [filters, initialListings]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // FIX-12: derive freshness from MAX(listedAt) over the inbound listings.
  // This is an interim signal until the ingestion schedule lands (path A) —
  // see BUILD_BRIEF.md §FIX-12.
  const lastRefreshedLabel = useMemo(() => {
    if (initialListings.length === 0) return null;
    let maxTs = 0;
    for (const l of initialListings) {
      const t = new Date(l.listedAt).getTime();
      if (Number.isFinite(t) && t > maxTs) maxTs = t;
    }
    if (maxTs === 0) return null;
    return relativeTime(new Date(maxTs).toISOString());
  }, [initialListings]);

  useEffect(() => { setPage(1); }, [filters]);

  const updateParams = useCallback(
    (next: Partial<Filters>) => {
      const params = paramsFromFilters(new URLSearchParams(search.toString()), next);
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, search],
  );

  const openInquire = useCallback(
    (ref: string) => {
      const params = new URLSearchParams(search.toString());
      params.set('inquire', opaqueOf(ref));
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, search, opaqueOf],
  );

  const closeInquire = useCallback(() => {
    const params = new URLSearchParams(search.toString());
    params.delete('inquire');
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [router, search]);

  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 dark:border-slate-800">
        {/* FIX-13: compressed hero — H1 smaller, subhead dropped. */}
        <div className="mx-auto max-w-content px-4 py-5 sm:px-6 sm:py-6">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Off-market & below-OP Dubai inventory.
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live · {initialListings.length} units
              {lastRefreshedLabel ? ` · refreshed ${lastRefreshedLabel}` : ''}
            </span>
            {dataSource === 'seed' && (
              <>
                <span className="text-slate-400">·</span>
                <span>Demo data</span>
              </>
            )}
          </div>
        </div>
      </section>

      <FilterBar filters={filters} onChange={updateParams} total={initialListings.length} filtered={filtered.length} />

      <div className="mx-auto max-w-content px-4 py-6 sm:px-6">
        <ActiveFilters
          filters={filters}
          onChange={updateParams}
          onReset={() => updateParams(FILTER_DEFAULTS)}
        />

        {filtered.length === 0 ? (
          <EmptyState onReset={() => updateParams(FILTER_DEFAULTS)} />
        ) : (
          <>
            <ListingTable items={pageItems} onInquire={openInquire} opaqueOf={opaqueOf} />
            <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
              {pageItems.map((l, idx) => (
                <ListingCard key={l.ref} listing={l} onInquire={openInquire} priority={idx === 0} />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}

        <div className="mt-10">
          <Link
            href="/alerts"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm font-medium text-slate-800 hover:border-brand hover:text-brand dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-dark dark:hover:text-brand-dark"
          >
            <Bell size={16} /> Get instant alerts on WhatsApp →
          </Link>
        </div>
      </div>

      {activeListing && <LeadModal listing={activeListing} onClose={closeInquire} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="text-4xl">🏠</p>
      <h3 className="mt-3 text-lg font-semibold">No listings match your filters.</h3>
      <p className="mt-1 text-sm text-slate-500">Try relaxing one of the filters above.</p>
      <button
        onClick={onReset}
        className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Reset filters
      </button>
    </div>
  );
}
