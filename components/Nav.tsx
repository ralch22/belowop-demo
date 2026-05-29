'use client';

import Link from 'next/link';
import { Bell, Menu } from 'lucide-react';
import { useState } from 'react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import clsx from 'clsx';

const links = [
  { href: '/', label: 'Listings' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/about', label: 'About' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

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
              {l.label}
            </Link>
          ))}
          <Link
            href="/alerts"
            className="group relative ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Get alerts"
            title="Get alerts"
          >
            <Bell size={18} />
            <span
              className="pointer-events-none absolute top-full mt-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100 dark:bg-slate-700"
              role="tooltip"
            >
              Get alerts
            </span>
          </Link>
          <ThemeToggle />
        </nav>
        <button
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 dark:text-slate-300"
          onClick={() => setOpen(!open)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      </div>
      <div
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
              {l.label}
            </Link>
          ))}
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="text-xs text-slate-500">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
