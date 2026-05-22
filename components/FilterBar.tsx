'use client';

import { SlidersHorizontal, ArrowUpDown, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import type { Filters } from '@/lib/listings';
import { allCommunities, allDevelopers } from '@/lib/listings';

const SORT_OPTIONS: { value: NonNullable<Filters['sort']>; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'drop_desc', label: 'Biggest drop' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
  { value: 'ppsqm_asc', label: 'AED/m² ↑' },
];

const TYPE_OPTIONS: { value: NonNullable<Filters['type']>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'off_plan', label: 'Off-plan' },
  { value: 'ready', label: 'Ready' },
];

const BEDS_OPTIONS: { value: NonNullable<Filters['beds']>; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'studio', label: 'Studio' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4+', label: '4+' },
];

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
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="sticky top-16 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto max-w-content px-4 py-3 sm:px-6">
        {/* Desktop / tablet */}
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
            label="Beds"
            value={filters.beds ?? 'any'}
            onChange={(v) => onChange({ beds: v as Filters['beds'] })}
            options={BEDS_OPTIONS.map((b) => ({ value: b.value, label: b.label }))}
          />

          <Select
            label="Area"
            value={filters.community ?? ''}
            onChange={(v) => onChange({ community: v || undefined })}
            options={[{ value: '', label: 'All areas' }, ...allCommunities.map((c) => ({ value: c, label: c }))]}
          />

          <Select
            label="Developer"
            value={filters.developer ?? ''}
            onChange={(v) => onChange({ developer: v || undefined })}
            options={[{ value: '', label: 'All developers' }, ...allDevelopers.map((d) => ({ value: d, label: d }))]}
          />

          <Select
            label="Min drop"
            value={String(filters.minDropPct ?? 0)}
            onChange={(v) => onChange({ minDropPct: Number(v) || undefined })}
            options={[
              { value: '0', label: 'Any' },
              { value: '5', label: '≥ 5%' },
              { value: '10', label: '≥ 10%' },
              { value: '15', label: '≥ 15%' },
            ]}
          />

          <Select
            label="Max price"
            value={String(filters.maxPrice ?? 0)}
            onChange={(v) => onChange({ maxPrice: Number(v) || undefined })}
            options={[
              { value: '0', label: 'Any' },
              { value: '2000000', label: 'AED 2M' },
              { value: '5000000', label: 'AED 5M' },
              { value: '10000000', label: 'AED 10M' },
              { value: '20000000', label: 'AED 20M' },
            ]}
          />

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              {filtered} of {total} units
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
            <SlidersHorizontal size={16} /> Filter
            {activeFilterCount(filters) > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                {activeFilterCount(filters)}
              </span>
            )}
          </button>
          <Select
            compact
            label="Sort"
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
              <p className="text-base font-semibold">Filters</p>
              <button
              onClick={() => setSheetOpen(false)}
              aria-label="Close filters"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X size={20} />
            </button>
            </div>
            <div className="space-y-4">
              <Field label="Type">
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
              <Field label="Beds">
                <NativeSelect
                  value={filters.beds ?? 'any'}
                  onChange={(v) => onChange({ beds: v as Filters['beds'] })}
                  options={BEDS_OPTIONS.map((b) => ({ value: b.value, label: b.label }))}
                />
              </Field>
              <Field label="Area">
                <NativeSelect
                  value={filters.community ?? ''}
                  onChange={(v) => onChange({ community: v || undefined })}
                  options={[{ value: '', label: 'All areas' }, ...allCommunities.map((c) => ({ value: c, label: c }))]}
                />
              </Field>
              <Field label="Developer">
                <NativeSelect
                  value={filters.developer ?? ''}
                  onChange={(v) => onChange({ developer: v || undefined })}
                  options={[{ value: '', label: 'All developers' }, ...allDevelopers.map((d) => ({ value: d, label: d }))]}
                />
              </Field>
              <Field label="Min drop %">
                <NativeSelect
                  value={String(filters.minDropPct ?? 0)}
                  onChange={(v) => onChange({ minDropPct: Number(v) || undefined })}
                  options={[
                    { value: '0', label: 'Any' },
                    { value: '5', label: '≥ 5%' },
                    { value: '10', label: '≥ 10%' },
                    { value: '15', label: '≥ 15%' },
                  ]}
                />
              </Field>
              <Field label="Max price (AED)">
                <NativeSelect
                  value={String(filters.maxPrice ?? 0)}
                  onChange={(v) => onChange({ maxPrice: Number(v) || undefined })}
                  options={[
                    { value: '0', label: 'Any' },
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
                Reset
              </button>
              <button
                onClick={() => setSheetOpen(false)}
                className="flex-1 rounded-md bg-brand py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
              >
                Show {filtered}
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
