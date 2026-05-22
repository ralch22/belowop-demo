import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Below OP</p>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
              Curated below-OP & off-market Dubai inventory. Follow on Telegram <a href="https://t.me/dubaipropertydeal" className="underline hover:text-brand">@DubaiPropertydeal</a>.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Site</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li><Link href="/" className="text-slate-700 hover:text-brand dark:text-slate-300">Listings</Link></li>
              <li><Link href="/alerts" className="text-slate-700 hover:text-brand dark:text-slate-300">Alerts</Link></li>
              <li><Link href="/about" className="text-slate-700 hover:text-brand dark:text-slate-300">About</Link></li>
              <li><Link href="/alert-preview" className="text-slate-700 hover:text-brand dark:text-slate-300">Alert preview</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Disclosure</p>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
              RERA broker registration: <span className="font-mono text-slate-500">{'<pending — §7.1>'}</span><br />
              Brokerage: <span className="font-mono text-slate-500">{'<TBD>'}</span>
            </p>
            <p className="mt-3 text-xs text-slate-500">
              <Link href="/privacy" className="hover:text-brand">Privacy</Link> · <Link href="/terms" className="hover:text-brand">Terms</Link> · <a href="mailto:rami@emergedigital.com" className="hover:text-brand">Contact</a> · <a href="https://github.com/ralch22/belowop-demo" className="hover:text-brand" target="_blank" rel="noopener noreferrer">Source</a>
            </p>
          </div>
        </div>
        <p className="mt-8 text-xs text-slate-500">© 2026 Below OP · Demo build · Not for production use.</p>
      </div>
    </footer>
  );
}
