import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import clsx from 'clsx';
import { Link } from '@/i18n/navigation';

/**
 * Link-based pagination for the broker directory. Unlike the client `Pagination`
 * (onChange state), this is a Server Component: each control is a real <a> to
 * `/brokers?…&page=N`, so the directory paginates without JS and stays
 * crawlable. Preserves the current q/status/firm params on every link.
 */
export default async function BrokerPagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  /** Current filter params to carry across page links (q / status / firm). */
  params: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;
  const t = await getTranslations('brokers');
  const rtl = (await getLocale()) === 'ar';
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;

  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== 'page') sp.set(k, v);
    }
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return qs ? `/brokers?${qs}` : '/brokers';
  };

  const atFirst = page <= 1;
  const atLast = page >= totalPages;
  const arrowBase =
    'inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800';
  const disabled = 'pointer-events-none opacity-40';

  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label={t('pageNav')}>
      {atFirst ? (
        <span className={clsx(arrowBase, disabled)} aria-hidden>
          <PrevIcon size={16} />
        </span>
      ) : (
        <Link href={hrefFor(page - 1)} className={arrowBase} aria-label={t('prevPage')} rel="prev">
          <PrevIcon size={16} />
        </Link>
      )}

      <span className="text-sm text-slate-600 dark:text-slate-400" aria-current="page">
        {t('pageOf', { page: String(page), total: String(totalPages) })}
      </span>

      {atLast ? (
        <span className={clsx(arrowBase, disabled)} aria-hidden>
          <NextIcon size={16} />
        </span>
      ) : (
        <Link href={hrefFor(page + 1)} className={arrowBase} aria-label={t('nextPage')} rel="next">
          <NextIcon size={16} />
        </Link>
      )}
    </nav>
  );
}
