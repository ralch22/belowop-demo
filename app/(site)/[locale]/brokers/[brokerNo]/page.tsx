import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ChevronLeft, Globe, Building2, BadgeCheck } from 'lucide-react';
import { fetchBrokerByNumber, isDbConfigured } from '@/lib/db';
import {
  licenseTone,
  formatLicenseDate,
  daysUntilExpiry,
  type PublicBroker,
  type LicenseTone,
} from '@/lib/rera';
import LicenseBadge from '@/components/LicenseBadge';

export const revalidate = 3600;

async function loadBroker(brokerNo: string): Promise<PublicBroker | null> {
  if (!isDbConfigured()) return null;
  try {
    return await fetchBrokerByNumber(decodeURIComponent(brokerNo));
  } catch (e) {
    console.error('[broker] fetch failed:', e);
    return null;
  }
}

export async function generateMetadata({
  params: { locale, brokerNo },
}: {
  params: { locale: string; brokerNo: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'metadata.brokerProfile' });
  const broker = await loadBroker(brokerNo);
  if (!broker) return { title: t('notFoundTitle') };
  return {
    title: t('title', { name: broker.nameEn }),
    description: t('description', { name: broker.nameEn, firm: broker.firmName ?? '—' }),
  };
}

export default async function BrokerProfilePage({
  params: { locale, brokerNo },
}: {
  params: { locale: string; brokerNo: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('brokers');
  const broker = await loadBroker(brokerNo);
  if (!broker) notFound();

  const tone = licenseTone(broker.licenseEnd);
  const badgeLabel: Record<LicenseTone, string> = {
    active: t('badge_active'),
    expiring: t('badge_expiring'),
    expired: t('badge_expired'),
    unknown: t('badge_unknown'),
  };
  const validFrom = formatLicenseDate(broker.licenseStart);
  const validTo = formatLicenseDate(broker.licenseEnd);
  const days = daysUntilExpiry(broker.licenseEnd);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/brokers"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand"
      >
        <ChevronLeft size={16} className="rtl:rotate-180" />
        {t('backToDirectory')}
      </Link>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{broker.nameEn}</h1>
            {broker.nameAr && (
              <p className="mt-1 text-base text-slate-600 dark:text-slate-400" dir="rtl" lang="ar">
                {broker.nameAr}
              </p>
            )}
          </div>
          <LicenseBadge tone={tone} label={badgeLabel[tone]} />
        </div>

        {/* Verification statement — the core trust signal. */}
        <div className="mt-5 flex items-start gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
          <BadgeCheck size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {tone === 'expired' ? t('verifyExpired') : t('verifyActive')}
          </p>
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label={t('fieldBrokerNo')}>
            <span className="font-mono">{broker.brokerNumber}</span>
          </Detail>
          {broker.realEstateNumber && (
            <Detail label={t('fieldBrokerageNo')}>
              <span className="font-mono">{broker.realEstateNumber}</span>
            </Detail>
          )}
          {validFrom && <Detail label={t('fieldValidFrom')}>{validFrom}</Detail>}
          {validTo && (
            <Detail label={t('fieldValidTo')}>
              {validTo}
              {days !== null && days >= 0 && days <= 90 && (
                <span className="ms-2 text-xs text-amber-600 dark:text-amber-400">
                  {t('expiresInDays', { days: String(days) })}
                </span>
              )}
            </Detail>
          )}
          {broker.firmName && (
            <Detail label={t('fieldFirm')}>
              {broker.firmDomain ? (
                <Link href={`/brokers?firm=${encodeURIComponent(broker.firmDomain)}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                  <Building2 size={14} />
                  {broker.firmName}
                </Link>
              ) : (
                broker.firmName
              )}
            </Detail>
          )}
          {broker.webpage && (
            <Detail label={t('fieldWebsite')}>
              <a
                href={broker.webpage.startsWith('http') ? broker.webpage : `https://${broker.webpage}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-brand hover:underline"
              >
                <Globe size={14} />
                {broker.firmDomain ?? broker.webpage}
              </a>
            </Detail>
          )}
        </dl>
      </div>

      {/* Privacy / takedown note (PDPL + DLD posture). */}
      <p className="mt-6 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {t.rich('removalNote', {
          email: (chunks) => (
            <a className="underline hover:text-brand" href="mailto:rami@emergedigital.com">
              {chunks}
            </a>
          ),
        })}
      </p>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('sourceNote')}</p>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}
