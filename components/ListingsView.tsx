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
import { Bell, LayoutGrid, List } from 'lucide-react';

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
  lastIngestAt = null,
}: {
  initialListings: Listing[];
  dataSource?: 'db' | 'seed';
  /**
   * Timestamp of the last successful ingestion run (v_ingestion_freshness
   * .last_success_at). This is the TRUE "data was refreshed" signal. When
   * present we label the pill from it; otherwise we fall back to the newest
   * listing's publication date (an approximation used in seed/dev mode).
   */
  lastIngestAt?: string | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  // Layout toggle (grid ↔ list). `null` until mounted so the server-rendered
  // markup keeps the original responsive behaviour (table on lg+, cards below)
  // and we never get a hydration mismatch. After mount we restore the saved
  // preference and track the viewport so the *default* (no explicit choice)
  // still mirrors the breakpoint.
  const [view, setView] = useState<'grid' | 'list' | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('belowop:view');
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      /* localStorage unavailable (private mode / SSR) — fall back to default */
    }
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setViewPref = useCallback((v: 'grid' | 'list') => {
    setView(v);
    try {
      localStorage.setItem('belowop:view', v);
    } catch {
      /* ignore persistence failures */
    }
  }, []);

  // null → pre-hydration (use the responsive Tailwind classes verbatim).
  const effectiveView: 'grid' | 'list' | null = mounted
    ? view ?? (isDesktop ? 'list' : 'grid')
    : null;

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

  // Freshness label. The ingestion schedule has now landed, so prefer the real
  // last-successful-ingest timestamp (v_ingestion_freshness.last_success_at) —
  // that's what "refreshed Xh ago" should mean. Only fall back to MAX(listedAt)
  // — the newest listing's *publication* date — in seed/dev mode where no
  // ingestion run exists. (Resolves the misleading "refreshed 2d ago" pill:
  // MAX(listedAt) reflects how old the freshest source listing is, not when we
  // last pulled data.)
  const lastRefreshedLabel = useMemo(() => {
    if (lastIngestAt) {
      const t = new Date(lastIngestAt).getTime();
      if (Number.isFinite(t)) return relativeTime(new Date(t).toISOString());
    }
    if (initialListings.length === 0) return null;
    let maxTs = 0;
    for (const l of initialListings) {
      const t = new Date(l.listedAt).getTime();
      if (Number.isFinite(t) && t > maxTs) maxTs = t;
    }
    if (maxTs === 0) return null;
    return relativeTime(new Date(maxTs).toISOString());
  }, [lastIngestAt, initialListings]);

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
            {mounted && effectiveView && (
              <div className="mb-4 flex items-center justify-end">
                <ViewToggle value={effectiveView} onChange={setViewPref} />
              </div>
            )}
            <div
              className={
                effectiveView === null
                  ? 'hidden lg:block'
                  : effectiveView === 'list'
                    ? 'block'
                    : 'hidden'
              }
            >
              <ListingTable items={pageItems} onInquire={openInquire} opaqueOf={opaqueOf} />
            </div>
            <div
              className={
                effectiveView === null
                  ? 'grid gap-4 sm:grid-cols-2 lg:hidden'
                  : effectiveView === 'grid'
                    ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    : 'hidden'
              }
            >
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

function ViewToggle({
  value,
  onChange,
}: {
  value: 'grid' | 'list';
  onChange: (v: 'grid' | 'list') => void;
}) {
  const btn = (active: boolean) =>
    `inline-flex h-8 w-8 items-center justify-center rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand ${
      active
        ? 'bg-brand text-white'
        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
    }`;
  return (
    <div
      role="group"
      aria-label="Layout"
      className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900"
    >
      <button
        type="button"
        aria-label="List view"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={btn(value === 'list')}
      >
        <List size={16} />
      </button>
      <button
        type="button"
        aria-label="Grid view"
        aria-pressed={value === 'grid'}
        onClick={() => onChange('grid')}
        className={btn(value === 'grid')}
      >
        <LayoutGrid size={16} />
      </button>
    </div>
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
