'use client';

import Image from 'next/image';
import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { ArrowUp, ArrowDown, Hammer, Key } from 'lucide-react';
import type { PublicListing, Filters } from '@/lib/listings';
import { safeProjectName } from '@/lib/op-parser';
import {
  formatAED,
  dropPct,
  dropColor,
  bedsLabel,
  relativeTime,
  imageUrl,
  formatSqm,
  formatPricePerSqm,
} from '@/lib/format';

// Sortable header keys map to a (sort param, direction-pair). Two-state cycle:
//   off → asc → desc → off.
// Sort options live in lib/listings.ts; we map UI columns onto those values.
type SortKey = 'project' | 'area' | 'price' | 'ppsqm' | 'drop' | 'age';

// Map a column + direction back to a `Filters['sort']` value. Note: not every
// (key, dir) combination has a corresponding back-end sort. Project/area use
// alpha order on the client. The brief lists project, area, price, AED/m²,
// Δ vs OP, age as sortable headers.
function sortFor(key: SortKey, dir: 'asc' | 'desc'): Filters['sort'] | null {
  if (key === 'price') return dir === 'asc' ? 'price_asc' : 'price_desc';
  if (key === 'ppsqm') return dir === 'asc' ? 'ppsqm_asc' : null; // only asc supported in lib
  if (key === 'drop') return 'drop_desc'; // single-direction
  if (key === 'age') return dir === 'asc' ? 'newest' : null; // newest = desc by date
  // project / area not in lib — handled here client-side by header pass-through.
  return null;
}

/**
 * True if this listing has a parsed Original Price distinct from the current
 * one (FIX-01). Defensive against three shapes:
 *   - originalPrice is null/undefined (DB column became NULLABLE)
 *   - originalPrice <= 0 (sentinel from older code paths)
 *   - originalPrice === currentPrice (parser fell back to current price)
 */
function hasKnownOp(l: PublicListing): boolean {
  const op = l.originalPrice as number | null | undefined;
  if (op == null) return false;
  if (!Number.isFinite(op) || op <= 0) return false;
  if (op === l.currentPrice) return false;
  return true;
}

function metaLine(l: PublicListing): string | null {
  const parts = [l.developer, relativeTime(l.listedAt)].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

export default function ListingTable({
  items,
  onInquire,
}: {
  items: PublicListing[];
  onInquire: (opaqueId: string) => void;
}) {
  const t = useTranslations('table');
  const router = useRouter();
  const search = useSearchParams();

  const currentSort = (search.get('sort') as Filters['sort']) ?? 'newest';

  // Cycle the URL `?sort=` parameter when a header is clicked (FIX-09).
  const onHeaderClick = useCallback(
    (key: SortKey) => {
      const params = new URLSearchParams(search.toString());
      const current = params.get('sort') ?? '';

      // For two-direction columns (price), cycle asc → desc → off.
      if (key === 'price') {
        if (current === 'price_asc') params.set('sort', 'price_desc');
        else if (current === 'price_desc') params.delete('sort');
        else params.set('sort', 'price_asc');
      } else if (key === 'ppsqm') {
        // Only asc supported; toggle on/off.
        if (current === 'ppsqm_asc') params.delete('sort');
        else params.set('sort', 'ppsqm_asc');
      } else if (key === 'drop') {
        if (current === 'drop_desc') params.delete('sort');
        else params.set('sort', 'drop_desc');
      } else if (key === 'age') {
        // `newest` = age ascending (most recent first); toggle on/off.
        if (current === 'newest') params.delete('sort');
        else params.set('sort', 'newest');
      }
      // project / area: no-op for now (no library support).
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, search],
  );

  const headerSortState = (key: SortKey): { active: boolean; dir: 'asc' | 'desc' | null } => {
    if (key === 'price' && currentSort === 'price_asc') return { active: true, dir: 'asc' };
    if (key === 'price' && currentSort === 'price_desc') return { active: true, dir: 'desc' };
    if (key === 'ppsqm' && currentSort === 'ppsqm_asc') return { active: true, dir: 'asc' };
    if (key === 'drop' && currentSort === 'drop_desc') return { active: true, dir: 'desc' };
    if (key === 'age' && currentSort === 'newest') return { active: true, dir: 'desc' };
    return { active: false, dir: null };
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[768px] text-sm">
        <thead className="bg-slate-50 text-start text-xs font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <tr>
            <th className="w-16 px-4 py-3"></th>
            <SortableHeader
              label={t('project')}
              sortKey="project"
              state={headerSortState('project')}
              onClick={onHeaderClick}
              sortable={false}
            />
            <SortableHeader
              label={t('area')}
              sortKey="area"
              state={headerSortState('area')}
              onClick={onHeaderClick}
              sortable={false}
            />
            <th className="px-4 py-3 text-center">{t('beds')}</th>
            <th className="px-4 py-3 text-end">{t('size')}</th>
            <SortableHeader
              label={t('priceAed')}
              sortKey="price"
              state={headerSortState('price')}
              onClick={onHeaderClick}
              align="right"
            />
            <SortableHeader
              label={t('perSqm')}
              sortKey="ppsqm"
              state={headerSortState('ppsqm')}
              onClick={onHeaderClick}
              align="right"
            />
            <SortableHeader
              label={t('age')}
              sortKey="age"
              state={headerSortState('age')}
              onClick={onHeaderClick}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {items.map((l, idx) => {
            const known = hasKnownOp(l);
            const delta = known ? dropPct(l.currentPrice, l.originalPrice as number) : null;
            const thumbSrc = l.imageUrl ?? imageUrl(l.imageId, 96);
            const project = safeProjectName(l.project, l.community);
            const meta = metaLine(l);
            const href = `/?inquire=${l.opaqueId}`;

            // Row click handler — same outcome as the anchor, but preserves
            // SPA replaceState (no full reload). Cmd/middle-click goes through
            // the anchor's native behaviour because we wrap each cell content
            // in a real <Link>.
            const onRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
              // Let the inner Link handle modifier/middle clicks.
              if (e.defaultPrevented) return;
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onInquire(l.opaqueId);
            };

            return (
              <tr
                key={l.opaqueId}
                tabIndex={0}
                role="button"
                aria-label={t('inquireAbout', { project: project ?? l.community, community: l.community })}
                onClick={onRowClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    onInquire(l.opaqueId);
                  }
                }}
                className="group cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand dark:border-slate-800 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800"
              >
                <td className="px-4 py-3">
                  <Link
                    href={href}
                    replace
                    scroll={false}
                    prefetch={false}
                    tabIndex={-1}
                    aria-hidden
                    className="block"
                    onClick={(e) => {
                      // Cmd/middle-click → let the browser open in a new tab.
                      // Plain click → let the row handler take over (preventDefault on the row).
                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && (e as React.MouseEvent).button === 0) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <div className="relative h-12 w-12 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700">
                      <Image
                        src={thumbSrc}
                        alt={project ?? l.community}
                        fill
                        sizes="48px"
                        priority={idx === 0}
                        loading={idx === 0 ? undefined : 'lazy'}
                        className="object-cover"
                      />
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <CellLink href={href}>
                    <div className="flex items-center gap-2">
                      {l.type === 'off_plan' ? (
                        <Hammer size={12} className="text-slate-500" aria-label={t('offPlan')} />
                      ) : (
                        <Key size={12} className="text-slate-500" aria-label={t('ready')} />
                      )}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {project ?? '—'}
                      </span>
                    </div>
                    {meta && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{meta}</p>
                    )}
                  </CellLink>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  <CellLink href={href}>{l.community}</CellLink>
                </td>
                <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">
                  <CellLink href={href}>{bedsLabel(l.beds)}</CellLink>
                </td>
                <td className="px-4 py-3 text-end font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  <CellLink href={href}>{formatSqm(l.sqft)}</CellLink>
                </td>
                <td className="px-4 py-3 text-end">
                  <CellLink href={href}>
                    <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatAED(l.currentPrice)}
                    </div>
                    {delta !== null && (
                      <div
                        className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums ${dropColor(
                          delta,
                        )}`}
                      >
                        {t('vsOp', { pct: delta.toFixed(1) })}
                      </div>
                    )}
                  </CellLink>
                </td>
                <td className="px-4 py-3 text-end font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  <CellLink href={href}>{formatPricePerSqm(l.currentPrice, l.sqft)}</CellLink>
                </td>
                <td className="px-4 py-3 text-end text-xs text-slate-500 dark:text-slate-400">
                  <CellLink href={href}>{relativeTime(l.listedAt)}</CellLink>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// A cell-spanning anchor that:
//   - lets cmd/middle-click open the inquire URL in a new tab (real <a>)
//   - lets plain left-clicks fall through to the row's onClick so we stay SPA
function CellLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      prefetch={false}
      tabIndex={-1}
      aria-hidden
      className="block"
      onClick={(e) => {
        // Suppress the Link's own navigation for plain clicks; the row's
        // onClick handler issues the router.replace.
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && (e as React.MouseEvent).button === 0) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </Link>
  );
}

function SortableHeader({
  label,
  sortKey,
  state,
  onClick,
  align,
  sortable = true,
}: {
  label: string;
  sortKey: SortKey;
  state: { active: boolean; dir: 'asc' | 'desc' | null };
  onClick: (key: SortKey) => void;
  align?: 'right' | 'left' | 'center';
  sortable?: boolean;
}) {
  const t = useTranslations('table');
  const cls = align === 'right' ? 'px-4 py-3 text-end' : 'px-4 py-3';
  if (!sortable) {
    return <th className={cls}>{label}</th>;
  }
  return (
    <th className={cls}>
      <button
        type="button"
        role="button"
        tabIndex={0}
        aria-label={t('sortBy', { label })}
        aria-sort={state.active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onClick={() => onClick(sortKey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            onClick(sortKey);
          }
        }}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand dark:hover:text-slate-100 ${
          state.active ? 'text-slate-900 dark:text-slate-100' : ''
        }`}
      >
        <span>{label}</span>
        {state.active && state.dir === 'asc' && <ArrowUp size={12} aria-hidden />}
        {state.active && state.dir === 'desc' && <ArrowDown size={12} aria-hidden />}
      </button>
    </th>
  );
}
