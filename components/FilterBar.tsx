'use client';

import { SlidersHorizontal, ArrowUpDown, X, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import type { Filters } from '@/lib/listings';
import { allCommunities, allDevelopers } from '@/lib/listings';

// Value-only option lists. Labels are resolved through the `filters` message
// namespace inside the component so EN/AR share one component. Bed counts and
// price magnitudes (2M/5M/…) stay as Western-digit literals — they're listing
// data presentation, not translatable chrome (consistent with bedsLabel() and
// formatAED() in lib/format.ts).
const SORT_VALUES: NonNullable<Filters['sort']>[] = [
  'newest',
  'drop_desc',
  'price_asc',
  'price_desc',
  'ppsqm_asc',
];

const TYPE_VALUES: NonNullable<Filters['type']>[] = ['all', 'off_plan', 'ready'];

const BEDS_VALUES: NonNullable<Filters['beds']>[] = ['any', 'studio', '1', '2', '3', '4+'];

export default function FilterBar({
  filters,
  onChange,
  total,
  filtered,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
  total: number;
  filtered: number;
}) {
  const t = useTranslations('filters');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);

  // Translated option lists (chrome).
  const sortLabels: Record<NonNullable<Filters['sort']>, string> = {
    newest: t('sortNewest'),
    drop_desc: t('sortBiggestDrop'),
    price_asc: t('sortPriceAsc'),
    price_desc: t('sortPriceDesc'),
    ppsqm_asc: t('sortPpsqmAsc'),
  };
  const SORT_OPTIONS = SORT_VALUES.map((v) => ({ value: v, label: sortLabels[v] }));
  const TYPE_OPTIONS = TYPE_VALUES.map((v) => ({
    value: v,
    label: v === 'all' ? t('all') : v === 'off_plan' ? t('offPlan') : t('ready'),
  }));
  const BEDS_OPTIONS = BEDS_VALUES.map((v) => ({
    // 'any' is chrome; 'Studio' and the numerals stay English/Western.
    value: v,
    label: v === 'any' ? t('any') : v === 'studio' ? 'Studio' : v,
  }));
  const DROP_OPTIONS = [
    { value: '0', label: t('any') },
    { value: '5', label: t('drop5') },
    { value: '10', label: t('drop10') },
    { value: '15', label: t('drop15') },
  ];

  // Track whether the overflow filters (Developer + Max price) are active so
  // the disclosure pill can show a count badge.
  const overflowActiveCount =
    (filters.developer ? 1 : 0) + (filters.maxPrice ? 1 : 0);

  // Focus trap + Escape close for the "More filters" disclosure panel.
  useEffect(() => {
    if (!moreOpen) return;

    const panel = morePanelRef.current;
    if (!panel) return;

    // Focus the first focusable element inside the panel on open.
    const focusables = panel.querySelectorAll<HTMLElement>(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMoreOpen(false);
        moreBtnRef.current?.focus();
        return;
      }
      if (e.key === 'Tab') {
        const nodes = panel!.querySelectorAll<HTMLElement>(
          'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!panel!.contains(target) && !moreBtnRef.current?.contains(target)) {
        setMoreOpen(false);
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [moreOpen]);

  return (
    <div className="sticky top-16 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto max-w-content px-4 py-3 sm:px-6">
        {/* Desktop / tablet (md to <lg): wrap allowed, all filters visible.
            Large (lg+): one row, Developer + Max price behind disclosure. */}
        <div className="hidden md:flex md:flex-wrap md:items-center md:gap-3">
          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => onChange({ type: o.value })}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded transition',
                  (filters.type ?? 'all') === o.value
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          <Select
            label={t('beds')}
            value={filters.beds ?? 'any'}
            onChange={(v) => onChange({ beds: v as Filters['beds'] })}
            options={BEDS_OPTIONS.map((b) => ({ value: b.value, label: b.label }))}
          />

          <Select
            label={t('area')}
            value={filters.community ?? ''}
            onChange={(v) => onChange({ community: v || undefined })}
            options={[{ value: '', label: t('allAreas') }, ...allCommunities.map((c) => ({ value: c, label: c }))]}
          />

          <Select
            label={t('minDrop')}
            value={String(filters.minDropPct ?? 0)}
            onChange={(v) => onChange({ minDropPct: Number(v) || undefined })}
            options={DROP_OPTIONS}
          />

          {/* md to <lg: Developer + Max price stay inline. */}
          <div className="contents lg:hidden">
            <Select
              label={t('developer')}
              value={filters.developer ?? ''}
              onChange={(v) => onChange({ developer: v || undefined })}
              options={[{ value: '', label: t('allDevelopers') }, ...allDevelopers.map((d) => ({ value: d, label: d }))]}
            />

            <Select
              label={t('maxPrice')}
              value={String(filters.maxPrice ?? 0)}
              onChange={(v) => onChange({ maxPrice: Number(v) || undefined })}
              options={[
                { value: '0', label: t('any') },
                { value: '2000000', label: 'AED 2M' },
                { value: '5000000', label: 'AED 5M' },
                { value: '10000000', label: 'AED 10M' },
                { value: '20000000', label: 'AED 20M' },
              ]}
            />
          </div>

          {/* lg+: Developer + Max price behind disclosure. */}
          <div className="relative hidden lg:block">
            <button
              ref={moreBtnRef}
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              aria-controls="more-filters-panel"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {t('moreFilters')}
              {overflowActiveCount > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {overflowActiveCount}
                </span>
              )}
              <ChevronDown size={14} className={clsx('transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen && (
              <div
                ref={morePanelRef}
                id="more-filters-panel"
                role="dialog"
                aria-modal="false"
                aria-label={t('moreFiltersDialog')}
                className="absolute start-0 top-full z-30 mt-2 w-72 rounded-md border border-slate-200 bg-white p-4 shadow-modal dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="space-y-3">
                  <PanelField label={t('developer')}>
                    <NativeSelect
                      value={filters.developer ?? ''}
                      onChange={(v) => onChange({ developer: v || undefined })}
                      options={[{ value: '', label: t('allDevelopers') }, ...allDevelopers.map((d) => ({ value: d, label: d }))]}
                    />
                  </PanelField>
                  <PanelField label={t('maxPriceAed')}>
                    <NativeSelect
                      value={String(filters.maxPrice ?? 0)}
                      onChange={(v) => onChange({ maxPrice: Number(v) || undefined })}
                      options={[
                        { value: '0', label: t('any') },
                        { value: '2000000', label: '2M' },
                        { value: '5000000', label: '5M' },
                        { value: '10000000', label: '10M' },
                        { value: '20000000', label: '20M' },
                      ]}
                    />
                  </PanelField>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ developer: undefined, maxPrice: undefined })}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {t('clear')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      moreBtnRef.current?.focus();
                    }}
                    className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
                  >
                    {t('done')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              {t('countOfTotal', { filtered: String(filtered), total: String(total) })}
            </span>
            <Select
              label={<ArrowUpDown size={14} />}
              value={filters.sort ?? 'newest'}
              onChange={(v) => onChange({ sort: v as Filters['sort'] })}
              options={SORT_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
            />
          </div>
        </div>

        {/* Mobile */}
        <div className="flex items-center justify-between md:hidden">
          <button
            onClick={() => setSheetOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700"
          >
            <SlidersHorizontal size={16} /> {t('filter')}
            {activeFilterCount(filters) > 0 && (
              <span className="ms-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                {activeFilterCount(filters)}
              </span>
            )}
          </button>
          <Select
            compact
            label={t('sort')}
            value={filters.sort ?? 'newest'}
            onChange={(v) => onChange({ sort: v as Filters['sort'] })}
            options={SORT_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
      </div>

      {/* Mobile filter sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-5 shadow-modal dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold">{t('filtersHeading')}</p>
              <button
              onClick={() => setSheetOpen(false)}
              aria-label={t('closeFilters')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X size={20} />
            </button>
            </div>
            <div className="space-y-4">
              <Field label={t('type')}>
                <div className="flex gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
                  {TYPE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => onChange({ type: o.value })}
                      className={clsx(
                        'flex-1 py-1.5 text-sm font-medium rounded',
                        (filters.type ?? 'all') === o.value
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400',
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t('beds')}>
                <NativeSelect
                  value={filters.beds ?? 'any'}
                  onChange={(v) => onChange({ beds: v as Filters['beds'] })}
                  options={BEDS_OPTIONS.map((b) => ({ value: b.value, label: b.label }))}
                />
              </Field>
              <Field label={t('area')}>
                <NativeSelect
                  value={filters.community ?? ''}
                  onChange={(v) => onChange({ community: v || undefined })}
                  options={[{ value: '', label: t('allAreas') }, ...allCommunities.map((c) => ({ value: c, label: c }))]}
                />
              </Field>
              <Field label={t('developer')}>
                <NativeSelect
                  value={filters.developer ?? ''}
                  onChange={(v) => onChange({ developer: v || undefined })}
                  options={[{ value: '', label: t('allDevelopers') }, ...allDevelopers.map((d) => ({ value: d, label: d }))]}
                />
              </Field>
              <Field label={t('minDropPct')}>
                <NativeSelect
                  value={String(filters.minDropPct ?? 0)}
                  onChange={(v) => onChange({ minDropPct: Number(v) || undefined })}
                  options={DROP_OPTIONS}
                />
              </Field>
              <Field label={t('maxPriceAed')}>
                <NativeSelect
                  value={String(filters.maxPrice ?? 0)}
                  onChange={(v) => onChange({ maxPrice: Number(v) || undefined })}
                  options={[
                    { value: '0', label: t('any') },
                    { value: '2000000', label: '2M' },
                    { value: '5000000', label: '5M' },
                    { value: '10000000', label: '10M' },
                    { value: '20000000', label: '20M' },
                  ]}
                />
              </Field>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => { onChange({ type: 'all', beds: 'any', community: undefined, developer: undefined, minDropPct: undefined, maxPrice: undefined }); }}
                className="flex-1 rounded-md border border-slate-300 py-2.5 text-sm font-medium dark:border-slate-700"
              >
                {t('reset')}
              </button>
              <button
                onClick={() => setSheetOpen(false)}
                className="flex-1 rounded-md bg-brand py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
              >
                {t('showCount', { count: String(filtered) })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.type && f.type !== 'all') n++;
  if (f.beds && f.beds !== 'any') n++;
  if (f.community) n++;
  if (f.developer) n++;
  if (f.minDropPct) n++;
  if (f.maxPrice) n++;
  return n;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function PanelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  compact,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <label className={clsx('inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900', compact ? 'py-1.5' : 'py-1.5')}>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-0 bg-transparent text-sm font-medium text-slate-900 rounded focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand dark:text-slate-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
