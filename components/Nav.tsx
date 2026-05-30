'use client';

import { Bell, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import clsx from 'clsx';

// Locale-aware hrefs: the i18n Link prefixes the active locale as needed
// ('/' → '/ar', '/alerts' → '/ar/alerts'). Labels resolve through the
// 'nav' message namespace so EN/AR share one component.
const links = [
  { href: '/', key: 'listings' },
  { href: '/alerts', key: 'alerts' },
  { href: '/brokers', key: 'brokers' },
  { href: '/about', key: 'about' },
] as const;

export default function Nav() {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // The mobile panel stays in the DOM (collapsed via max-height) so it can
  // animate open/closed. While collapsed it must not be keyboard-reachable or
  // exposed to assistive tech — `inert` removes it from the tab order and the
  // a11y tree. `inert` isn't in the stable React types yet, so toggle it via
  // the DOM (same approach LeadModal uses for the page background).
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (open) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="Below OP home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t(l.key)}
            </Link>
          ))}
          <Link
            href="/alerts"
            className="group relative ms-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={t('getAlerts')}
            title={t('getAlerts')}
          >
            <Bell size={18} />
            <span
              className="pointer-events-none absolute top-full mt-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100 dark:bg-slate-700"
              role="tooltip"
            >
              {t('getAlerts')}
            </span>
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
        <button
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setOpen(!open)}
          aria-label={open ? t('closeMenu') : t('openMenu')}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <div
        id="mobile-menu"
        ref={panelRef}
        aria-hidden={!open}
        className={clsx(
          'md:hidden overflow-hidden border-t border-slate-200 dark:border-slate-800 transition-all',
          open ? 'max-h-64' : 'max-h-0',
        )}
      >
        <div className="flex flex-col gap-1 px-4 py-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t(l.key)}
            </Link>
          ))}
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="text-xs text-slate-500">{t('theme')}</span>
            <ThemeToggle />
          </div>
          <div className="px-3 pt-1">
            <LanguageSwitcher className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-300 dark:hover:bg-slate-800" />
          </div>
        </div>
      </div>
    </header>
  );
}
