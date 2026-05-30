import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChevronRight, Building2 } from 'lucide-react';
import {
  fetchBrokers,
  brokerDirectoryStats,
  isDbConfigured,
  type BrokerDirectoryStats,
} from '@/lib/db';
import { licenseTone, formatLicenseDate, type PublicBroker, type LicenseTone } from '@/lib/rera';
import BrokerSearchBar from '@/components/BrokerSearchBar';
import BrokerPagination from '@/components/BrokerPagination';
import LicenseBadge from '@/components/LicenseBadge';

// The registry is a static snapshot of public DLD data; revalidate hourly.
export const revalidate = 3600;

const PAGE_SIZE = 24;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'metadata.brokers' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { languages: { en: '/brokers', ar: '/ar/brokers' } },
  };
}

type SearchParams = { q?: string; status?: string; firm?: string; page?: string };

function normStatus(s: string | undefined): 'all' | 'active' | 'expired' {
  return s === 'active' || s === 'expired' ? s : 'all';
}

export default async function BrokersPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: SearchParams;
}) {
  setRequestLocale(locale);
  const t = await getTranslations('brokers');

  const status = normStatus(searchParams.status);
  const q = searchParams.q?.trim() || undefined;
  const firm = searchParams.firm?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);

  // Tone → translated badge label. Computed once per render.
  const badgeLabel: Record<LicenseTone, string> = {
    active: t('badge_active'),
    expiring: t('badge_expiring'),
    expired: t('badge_expired'),
    unknown: t('badge_unknown'),
  };

  let brokers: PublicBroker[] = [];
  let total = 0;
  let stats: BrokerDirectoryStats | null = null;
  let dbError = false;

  if (isDbConfigured()) {
    try {
      const [stat, list] = await Promise.all([
        brokerDirectoryStats(),
        fetchBrokers({ q, status, firm, page, pageSize: PAGE_SIZE }),
      ]);
      stats = stat;
      brokers = list.brokers;
      total = list.total;
    } catch (e) {
      console.error('[brokers] fetch failed:', e);
      dbError = true;
    }
  } else {
    dbError = true;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtering = Boolean(q || firm || status !== 'all');

  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t('intro')}</p>
        {stats && (
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('statTotal')} value={stats.total} />
            <Stat label={t('statActive')} value={stats.active} tone="active" />
            <Stat label={t('statExpired')} value={stats.expired} tone="expired" />
            <Stat label={t('statFirms')} value={stats.firms} />
          </dl>
        )}
      </header>

      <div className="mb-6">
        <Suspense fallback={<div className="h-10" />}>
          <BrokerSearchBar />
        </Suspense>
      </div>

      {firm && brokers[0]?.firmName && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800">
          <Building2 size={14} className="text-slate-500" />
          <span className="font-medium">{brokers[0].firmName}</span>
          <Link href="/brokers" className="text-slate-500 hover:text-brand" aria-label={t('clearFirm')}>
            ✕
          </Link>
        </div>
      )}

      {dbError ? (
        <EmptyPanel title={t('unavailableTitle')} body={t('unavailableBody')} />
      ) : brokers.length === 0 ? (
        <EmptyPanel
          title={t('noResultsTitle')}
          body={filtering ? t('noResultsBody') : t('emptyBody')}
          action={
            filtering ? (
              <Link
                href="/brokers"
                className="mt-4 inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {t('clearFilters')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-4 text-xs text-slate-500">{t('resultCount', { count: String(total) })}</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brokers.map((b) => {
              const tone = licenseTone(b.licenseEnd);
              const validTo = formatLicenseDate(b.licenseEnd);
              return (
                <li key={b.brokerNumber}>
                  <Link
                    href={`/brokers/${encodeURIComponent(b.brokerNumber)}`}
                    className="group flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-card transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-dark"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 font-medium text-slate-900 dark:text-slate-100">
                        {b.nameEn}
                      </p>
                      <ChevronRight
                        size={16}
                        className="mt-0.5 shrink-0 text-slate-300 transition group-hover:text-brand rtl:rotate-180"
                      />
                    </div>
                    {b.firmName && (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-600 dark:text-slate-400">
                        {b.firmName}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <LicenseBadge tone={tone} label={badgeLabel[tone]} size="sm" />
                      <span className="font-mono text-[11px] text-slate-400">
                        {t('brokerNoShort', { no: b.brokerNumber })}
                      </span>
                    </div>
                    {validTo && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        {t('validTo', { date: validTo })}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <BrokerPagination
            page={page}
            totalPages={totalPages}
            params={{ q, status: status === 'all' ? undefined : status, firm }}
          />
        </>
      )}

      <p className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800">
        {t('sourceNote')}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'active' | 'expired';
}) {
  const valueColor =
    tone === 'active'
      ? 'text-green-600 dark:text-green-400'
      : tone === 'expired'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <dd className={`font-mono text-xl font-semibold tabular-nums ${valueColor}`}>
        {value.toLocaleString()}
      </dd>
      <dt className="mt-0.5 text-xs text-slate-500">{label}</dt>
    </div>
  );
}

function EmptyPanel({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
      {action}
    </div>
  );
}
