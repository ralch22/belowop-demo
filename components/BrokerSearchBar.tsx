'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';
import { useRouter, usePathname } from '@/i18n/navigation';

type Status = 'all' | 'active' | 'expired';

/**
 * Search + status filter for the broker directory. Drives the URL (?q / ?status)
 * so the server page can read params and re-query — same pattern ListingsView
 * uses (router.replace, scroll:false). Typing is debounced (350ms); changing
 * any filter resets pagination by dropping ?page.
 */
export default function BrokerSearchBar() {
  const t = useTranslations('brokers');
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const status = (search.get('status') as Status) || 'all';
  const [q, setQ] = useState(search.get('q') ?? '');
  // Track the latest committed value so external param changes (back/forward)
  // re-sync the input without clobbering in-flight typing.
  const committed = useRef(search.get('q') ?? '');

  useEffect(() => {
    const next = search.get('q') ?? '';
    if (next !== committed.current) {
      committed.current = next;
      setQ(next);
    }
  }, [search]);

  function pushParams(next: { q?: string; status?: Status }) {
    const params = new URLSearchParams(search.toString());
    if (next.q !== undefined) {
      if (next.q.trim()) params.set('q', next.q.trim());
      else params.delete('q');
      committed.current = next.q.trim();
    }
    if (next.status !== undefined) {
      if (next.status === 'all') params.delete('status');
      else params.set('status', next.status);
    }
    params.delete('page'); // any filter change returns to page 1
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Debounce free-text search.
  useEffect(() => {
    if (q === committed.current) return;
    const id = setTimeout(() => pushParams({ q }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const statuses: Status[] = ['all', 'active', 'expired'];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 sm:max-w-md">
        <Search
          size={16}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          className="block w-full rounded-md border border-slate-300 bg-white py-2 ps-9 pe-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand dark:border-slate-700 dark:bg-slate-900"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={t('clearSearch')}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label={t('statusGroup')}
        className="inline-flex rounded-md bg-slate-100 p-1 dark:bg-slate-800"
      >
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => pushParams({ status: s })}
            aria-pressed={status === s}
            className={clsx(
              'rounded px-3 py-1.5 text-sm font-medium transition',
              status === s
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {t(`status_${s}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
