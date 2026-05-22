'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  applyFilters,
  buildOpaqueMaps,
  type Filters,
  type Listing,
} from '@/lib/listings';
import FilterBar from './FilterBar';
import ListingTable from './ListingTable';
import ListingCard from './ListingCard';
import Pagination from './Pagination';
import LeadModal from './LeadModal';
import Toast from './Toast';
import Link from 'next/link';
import { Bell } from 'lucide-react';

// SRS-FR-24: paginate the public table 25 per page.
const PAGE_SIZE = 25;

function filtersFromParams(p: URLSearchParams): Filters {
  return {
    type: (p.get('type') as Filters['type']) ?? 'all',
    beds: (p.get('beds') as Filters['beds']) ?? 'any',
    community: p.get('area') ?? undefined,
    developer: p.get('dev') ?? undefined,
    minDropPct: p.get('drop') ? Number(p.get('drop')) : undefined,
    maxPrice: p.get('max') ? Number(p.get('max')) : undefined,
    sort: (p.get('sort') as Filters['sort']) ?? 'newest',
  };
}

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
  const { opaqueOf, findByOpaqueId } = useMemo(() => buildOpaqueMaps(initialListings), [initialListings]);

  const filters = useMemo(() => filtersFromParams(new URLSearchParams(search.toString())), [search]);
  const inquireParam = search.get('inquire');
  const activeListing = inquireParam ? findByOpaqueId(inquireParam) : undefined;

  const filtered = useMemo(() => applyFilters(initialListings, filters), [filters, initialListings]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filters]);

  const updateParams = useCallback(
    (next: Partial<Filters>) => {
      const params = new URLSearchParams(search.toString());
      const apply = (k: string, v: string | number | undefined | null) => {
        if (v === undefined || v === null || v === '' || v === 'all' || v === 'any' || v === 0) params.delete(k);
        else params.set(k, String(v));
      };
      if ('type' in next) apply('type', next.type);
      if ('beds' in next) apply('beds', next.beds);
      if ('community' in next) apply('area', next.community);
      if ('developer' in next) apply('dev', next.developer);
      if ('minDropPct' in next) apply('drop', next.minDropPct);
      if ('maxPrice' in next) apply('max', next.maxPrice);
      if ('sort' in next) apply('sort', next.sort);
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
        <div className="mx-auto max-w-content px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Off-market & below-OP Dubai inventory.
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-slate-600 dark:text-slate-400">
            Curated, broker-verified units listed below Original Price. Updated daily.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Live · {initialListings.length} units tracked</span>
            <span className="text-slate-400">·</span>
            <span>{dataSource === 'db' ? 'From live DB' : 'Demo data'}</span>
          </div>
        </div>
      </section>

      <FilterBar filters={filters} onChange={updateParams} total={initialListings.length} filtered={filtered.length} />

      <div className="mx-auto max-w-content px-4 py-6 sm:px-6">
        {filtered.length === 0 ? (
          <EmptyState onReset={() => updateParams({ type: 'all', beds: 'any', community: undefined, developer: undefined, minDropPct: undefined, maxPrice: undefined })} />
        ) : (
          <>
            <ListingTable items={pageItems} onInquire={openInquire} />
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
