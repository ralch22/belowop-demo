import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl">🏚️</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Page not found.</h1>
      <p className="mt-2 text-sm text-slate-500">The unit you&apos;re looking for may have been removed or never listed.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">
          See current listings
        </Link>
        <Link href="/alerts" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-700">
          Get alerts
        </Link>
      </div>
    </div>
  );
}
