import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { WifiOff } from 'lucide-react';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'offline' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function OfflinePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('offline');
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <WifiOff className="text-slate-600 dark:text-slate-300" size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {t('body')}
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
      >
        {t('tryAgain')}
      </Link>
    </div>
  );
}
