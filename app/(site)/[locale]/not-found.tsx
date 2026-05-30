import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// Server component so it renders reliably as the not-found boundary for the
// [locale] segment. A 'use client' boundary can escalate to the framework
// default 404 when its NextIntlClientProvider context isn't on the render
// path during a notFound() bubble. The locale is already in the request store
// (middleware + setRequestLocale in the catch-all page), so getTranslations()
// resolves the right catalog without needing params.
export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl">🏚️</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-sm text-slate-500">{t('body')}</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">
          {t('seeListings')}
        </Link>
        <Link href="/alerts" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700">
          {t('getAlerts')}
        </Link>
      </div>
    </div>
  );
}
