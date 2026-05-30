'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import LanguageSwitcher from './LanguageSwitcher';

export default function Footer() {
  const t = useTranslations('footer');
  const reraReady = process.env.NEXT_PUBLIC_RERA_READY === 'true';

  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Below OP</p>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
              {t('tagline')} {t('followTelegram')} <a href="https://t.me/dubaipropertydeal" className="underline hover:text-brand">@DubaiPropertydeal</a>.
            </p>
            <div className="mt-4">
              <LanguageSwitcher className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('siteHeading')}</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li><Link href="/" className="text-slate-700 hover:text-brand dark:text-slate-300">{t('listings')}</Link></li>
              <li>
                <Link
                  href="/alerts"
                  className="inline-flex min-h-[44px] items-center text-slate-700 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-300"
                >
                  {t('getAlertsWhatsapp')} <span aria-hidden>→</span>
                </Link>
              </li>
              <li><Link href="/about" className="text-slate-700 hover:text-brand dark:text-slate-300">{t('about')}</Link></li>
              <li><Link href="/alert-preview" className="text-slate-700 hover:text-brand dark:text-slate-300">{t('alertPreview')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('contactHeading')}</p>
            {reraReady && (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
                {t('reraLabel')} <span className="font-mono">{process.env.NEXT_PUBLIC_RERA_NUMBER}</span><br />
                {t('brokerageLabel')} <span className="font-mono">{process.env.NEXT_PUBLIC_BROKERAGE_NAME}</span>
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              <Link href="/privacy" className="hover:text-brand">{t('privacy')}</Link> · <Link href="/terms" className="hover:text-brand">{t('terms')}</Link> · <a href="mailto:rami@emergedigital.com" className="hover:text-brand">{t('contact')}</a> · <a href="https://github.com/ralch22/belowop-demo" className="hover:text-brand" target="_blank" rel="noopener noreferrer">{t('source')}</a>
            </p>
          </div>
        </div>
        <p className="mt-8 text-xs text-slate-500">{t('copyright')}</p>
      </div>
    </footer>
  );
}
