import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin-auth';
import RelayPanel from '@/components/RelayPanel';

export const dynamic = 'force-dynamic';

export default function AdminRelayPage() {
  if (!isAdmin()) redirect('/admin/login');

  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Channel relay</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Telegram is fully automated. WhatsApp Channels have no public API,
            so this surface prepares each alert for one-tap manual paste.
            Workflow: <strong>Copy caption</strong> → <strong>Download hero</strong> → <strong>Open channel</strong> → paste both → send.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-slate-600 hover:text-brand dark:text-slate-400">← back to admin</Link>
      </div>

      <div className="mt-6">
        <RelayPanel />
      </div>

      <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
        <p className="font-semibold mb-1">Why this is manual</p>
        <p>
          WhatsApp Channels are a one-way broadcast surface that only the channel admin can post to via the WhatsApp app / WhatsApp Web.
          There is no public Channels API, and the Twilio + Meta WhatsApp Business API can only message individual phone numbers (not channels).
          Unofficial WhatsApp Web automation services (Maytapi, Wassenger, etc.) <strong>violate WhatsApp ToS</strong> and risk a permanent ban of the channel + admin account — strongly recommended against.
        </p>
        <p className="mt-2">
          Most Dubai broker channels operate this way: alerts queued by automation, posts sent manually by a human admin in ~5 seconds each.
          Telegram broadcasts cover the real-time use case automatically.
        </p>
      </div>
    </div>
  );
}
