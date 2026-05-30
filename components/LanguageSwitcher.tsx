'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Globe } from 'lucide-react';

/**
 * EN ⇄ AR toggle.
 *
 * With exactly two locales this is a single button that flips to the other
 * one. It uses the i18n-aware `usePathname` (which returns the path WITHOUT
 * the locale prefix, e.g. '/about' on both '/about' and '/ar/about') and
 * `useRouter().replace(path, { locale })` so next-intl re-prefixes correctly.
 *
 * Query string is preserved across the switch (e.g. ?inquire=u-xxxxxx keeps
 * the lead modal open on the same unit). We read `window.location.search` at
 * click time rather than via `useSearchParams` so the surrounding page isn't
 * forced out of static rendering (SSG bailout).
 */
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const t = useTranslations('languageSwitcher');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const next = locale === 'ar' ? 'en' : 'ar';
  const nextLabel = next === 'ar' ? t('ar') : t('en');

  function switchTo() {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(`${pathname}${qs}`, { locale: next });
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      aria-label={`${t('label')}: ${nextLabel}`}
      className={
        className ||
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-300 dark:hover:bg-slate-800'
      }
    >
      <Globe size={16} aria-hidden />
      <span>{nextLabel}</span>
    </button>
  );
}
