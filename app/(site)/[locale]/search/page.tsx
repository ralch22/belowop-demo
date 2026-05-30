import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import ListingsView from '@/components/ListingsView';
import { loadListings } from '@/lib/load-listings';

export const revalidate = 60; // ISR — refresh listing data every 60s.

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'metadata.search' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { languages: { en: '/search', ar: '/ar/search' } },
  };
}

export default async function SearchPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const { listings, source, lastIngestAt } = await loadListings();
  return (
    <Suspense fallback={<div className="mx-auto max-w-content px-4 py-12 text-sm text-slate-500">{t('loading')}</div>}>
      <ListingsView
        initialListings={listings}
        dataSource={source}
        lastIngestAt={lastIngestAt}
        variant="search"
      />
    </Suspense>
  );
}
