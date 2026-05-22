import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata = {
  title: 'Offline · Below OP',
  description: 'You are offline. Below OP will reconnect when you are back online.',
};

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <WifiOff className="text-slate-600 dark:text-slate-300" size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">You&apos;re offline.</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        We can&apos;t reach Below OP right now. Once you&apos;re back online, recently viewed listings
        will still be available.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
      >
        Try again
      </Link>
    </div>
  );
}
