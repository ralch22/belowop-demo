'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Filters } from '@/lib/listings';

/**
 * Active-filter chip strip (FIX-10).
 *
 * Renders above the listing table whenever ≥ 1 filter is non-default. Each
 * chip removes its own filter on click; `Reset all` clears the whole set.
 *
 * The filter→URL mapping lives in `lib/listings.ts` (paramsFromFilters);
 * this component is purely presentational and dispatches partial updates
 * back to ListingsView, which owns the router/URL sync.
 */
export default function ActiveFilters({
  filters,
  onChange,
  onReset,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
  onReset: () => void;
}) {
  const t = useTranslations('filters');
  const chips = buildChips(filters, t);
  if (chips.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
      <span className="font-medium text-slate-700 dark:text-slate-300">{t('chipsLabel')}</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChange(chip.clear)}
          aria-label={t('removeChip', { label: chip.label })}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span>{chip.label}</span>
          <X size={12} aria-hidden />
        </button>
      ))}
      <span className="text-slate-400" aria-hidden>·</span>
      <button
        type="button"
        onClick={onReset}
        className="text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand"
      >
        {t('resetAll')}
      </button>
    </div>
  );
}

interface Chip {
  key: string;
  label: string;
  /** Partial update that removes this filter (sets to default). */
  clear: Partial<Filters>;
}

// `t` is the `filters` namespace translator. Chip values that are listing data
// (community, developer, bed counts) stay verbatim/English; the chrome wrappers
// (type label, "drop", "≤") are translated.
function buildChips(f: Filters, t: (key: string, values?: Record<string, string>) => string): Chip[] {
  const chips: Chip[] = [];
  if (f.type && f.type !== 'all') {
    chips.push({
      key: 'type',
      label: f.type === 'off_plan' ? t('offPlan') : t('ready'),
      clear: { type: 'all' },
    });
  }
  if (f.beds && f.beds !== 'any') {
    const label = f.beds === 'studio' ? 'Studio' : f.beds === '4+' ? '4+ BR' : `${f.beds} BR`;
    chips.push({ key: 'beds', label, clear: { beds: 'any' } });
  }
  if (f.community) {
    chips.push({ key: 'area', label: f.community, clear: { community: undefined } });
  }
  if (f.developer) {
    chips.push({ key: 'dev', label: f.developer, clear: { developer: undefined } });
  }
  if (f.minDropPct) {
    chips.push({
      key: 'drop',
      label: t('chipDrop', { pct: String(f.minDropPct) }),
      clear: { minDropPct: undefined },
    });
  }
  if (f.maxPrice) {
    chips.push({
      key: 'max',
      label: t('chipMax', { price: formatPriceShort(f.maxPrice) }),
      clear: { maxPrice: undefined },
    });
  }
  return chips;
}

function formatPriceShort(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `AED ${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `AED ${(n / 1_000).toFixed(0)}K`;
  return `AED ${n}`;
}
