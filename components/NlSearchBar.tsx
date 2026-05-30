'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { Filters } from '@/lib/listings';

/**
 * Natural-language search bar. Posts the broker's free-text brief to
 * /api/search, which returns a structured `Filters` object (via the Vercel AI
 * Gateway, or a deterministic fallback). The parent applies those filters
 * through the existing URL-param pipeline, so results update exactly as if the
 * filters had been set by hand.
 *
 * `prominent` enlarges the control for the dedicated /search hero; the default
 * compact form sits above the FilterBar on the listings page.
 */
export default function NlSearchBar({
  onApply,
  prominent = false,
  autoFocus = false,
}: {
  onApply: (filters: Filters) => void;
  prominent?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations('search');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Example briefs (array via t.raw) — clicking one runs it immediately.
  const examples = (() => {
    try {
      const raw = t.raw('examples');
      return Array.isArray(raw) ? (raw as string[]) : [];
    } catch {
      return [];
    }
  })();

  async function run(query: string) {
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: trimmed }),
      });
      if (res.status === 429) {
        setError(t('errLimit'));
        return;
      }
      if (!res.ok) {
        setError(t('errGeneric'));
        return;
      }
      const data = await res.json();
      if (data?.ok && data.filters) {
        onApply(data.filters as Filters);
      } else {
        setError(t('errGeneric'));
      }
    } catch {
      setError(t('errNetwork'));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run(q);
  }

  return (
    <div className={clsx(prominent ? 'mx-auto w-full max-w-2xl' : 'w-full')}>
      <form onSubmit={onSubmit} role="search" aria-label={t('label')}>
        <div
          className={clsx(
            'flex items-center gap-2 rounded-xl border bg-white shadow-sm transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30 dark:bg-slate-900',
            error ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-700',
            prominent ? 'px-4 py-3' : 'px-3 py-2',
          )}
        >
          <Sparkles
            size={prominent ? 20 : 18}
            className="shrink-0 text-brand"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={q}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- opt-in for the dedicated /search hero only
            autoFocus={autoFocus}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('placeholder')}
            aria-label={t('label')}
            aria-describedby={error ? 'nl-search-error' : 'nl-search-hint'}
            maxLength={280}
            className={clsx(
              'min-w-0 flex-1 bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500',
              prominent ? 'text-base' : 'text-sm',
            )}
          />
          <button
            type="submit"
            disabled={loading || !q.trim()}
            aria-label={t('submit')}
            className={clsx(
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand font-semibold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
              prominent ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-sm',
            )}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <>
                <span className={prominent ? 'inline' : 'hidden sm:inline'}>{t('submit')}</span>
                <ArrowRight size={16} aria-hidden />
              </>
            )}
          </button>
        </div>
      </form>

      {error ? (
        <p id="nl-search-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : (
        <p id="nl-search-hint" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {t('hint')}
        </p>
      )}

      {examples.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={loading}
              onClick={() => {
                setQ(ex);
                void run(ex);
              }}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
