import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin-auth';
import { getStats, getRecentLeads, getRecentListings } from '@/lib/admin-data';
import { formatAED, dropPct, dropColor, relativeTime } from '@/lib/format';
import AdminRunButtons from '@/components/AdminRunButtons';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!isAdmin()) redirect('/admin/login');

  const [stats, leads, recent] = await Promise.all([
    getStats(),
    getRecentLeads(10),
    getRecentListings(10),
  ]);

  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-xs text-slate-500 mt-1">
            Data source: <span className="font-mono">{stats.source}</span>
            {stats.ingest.lastRunAt && (
              <> · Last ingest: <span className="font-mono">{relativeTime(stats.ingest.lastRunAt)}</span></>
            )}
          </p>
        </div>
        <form method="POST" action="/api/admin/login?_method=DELETE">
          <input type="hidden" name="_method" value="DELETE" />
          <Link
            href="/api/admin/login"
            className="text-sm text-slate-600 hover:text-brand dark:text-slate-400"
          >
            Sign out
          </Link>
        </form>
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Listings" main={stats.listings.total} sub={`${stats.listings.offPlan} off-plan · ${stats.listings.ready} ready`} />
        <StatCard label="Leads (24h)" main={stats.leads.last24h} sub={`${stats.leads.total} total · ${stats.leads.notified} notified`} />
        <StatCard
          label="Alert queue"
          main={stats.alerts.pending}
          sub={`${stats.alerts.dispatched} sent · ${stats.alerts.errored} errored`}
          tone={stats.alerts.errored > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Subscribers"
          main={stats.subscriptions.active}
          sub={`${stats.subscriptions.pending} pending · ${stats.subscriptions.unsubscribed} opted out`}
        />
      </div>

      {/* Run-now controls */}
      <div className="mt-6">
        <AdminRunButtons />
      </div>

      {/* OP parse rate */}
      {stats.ingest.opParseRate !== null && (
        <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
          OP parse hit-rate: <span className="font-mono font-semibold">{(stats.ingest.opParseRate * 100).toFixed(0)}%</span>
          <span className="text-slate-500"> · % of listings whose OP was extracted from description (vs. first-seen fallback)</span>
        </div>
      )}

      {/* Tables */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Recent listings" emptyHint={recent.length === 0 ? 'No data yet — once Apify is wired up, ingested listings appear here.' : undefined}>
          {recent.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Project</th><th>Area</th><th className="text-right">Price</th><th className="text-right">Δ</th></tr>
              </thead>
              <tbody>
                {recent.map((l) => {
                  const d = dropPct(Number(l.current_price), Number(l.original_price));
                  return (
                    <tr key={l.external_ref} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-2">
                        <p className="font-medium">{l.project}</p>
                        <p className="text-[10px] text-slate-500">{l.developer ?? '—'}</p>
                      </td>
                      <td className="text-slate-600 dark:text-slate-400">{l.community}</td>
                      <td className="font-mono tabular-nums text-right">{formatAED(Number(l.current_price))}</td>
                      <td className={`font-mono tabular-nums text-right font-semibold ${dropColor(d)}`}>{d.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent leads" emptyHint={leads.length === 0 ? 'No leads yet. Submit one from the public site to see it here.' : undefined}>
          {leads.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Name</th><th>Phone</th><th>Listing</th><th className="text-right">When</th></tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-medium">
                      {l.name}
                      {l.notified ? <span className="ml-1 text-[10px] text-green-700">✓</span> : <span className="ml-1 text-[10px] text-amber-700">⏳</span>}
                    </td>
                    <td className="font-mono text-[11px]">{l.phone}</td>
                    <td className="text-slate-600 dark:text-slate-400">{l.project ?? '—'}</td>
                    <td className="text-right text-[10px] text-slate-500">{relativeTime(l.captured_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="mt-8 text-xs text-slate-500">
        <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Health checks</p>
        <ul className="space-y-1">
          <li>Apify webhook: <Link className="text-brand hover:underline" href="/api/webhooks/apify">/api/webhooks/apify</Link> (401 unauthorized when called without HMAC)</li>
          <li>Alert dispatch (cron): <Link className="text-brand hover:underline" href="/api/alerts/dispatch">/api/alerts/dispatch</Link></li>
          <li>Image sync (cron): <Link className="text-brand hover:underline" href="/api/image-sync">/api/image-sync</Link></li>
          <li>OG card sample: <Link className="text-brand hover:underline" href="/api/og?ref=PF-44027">/api/og?ref=PF-44027</Link></li>
          <li>Alert preview (live): <Link className="text-brand hover:underline" href="/admin/preview">/admin/preview</Link></li>
          <li>Parser test: <Link className="text-brand hover:underline" href="/admin/ingest">/admin/ingest</Link></li>
          <li>WhatsApp Channel relay: <Link className="text-brand hover:underline" href="/admin/relay">/admin/relay</Link></li>
          <li>Pipeline health: <Link className="text-brand hover:underline font-semibold" href="/admin/pipeline">/admin/pipeline</Link> ← ingestion runs + stale pruning</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, main, sub, tone = 'default' }: { label: string; main: number | string; sub?: string; tone?: 'default' | 'warn' }) {
  return (
    <div className={`rounded-lg border bg-white p-4 dark:bg-slate-900 ${tone === 'warn' ? 'border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-slate-800'}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{main}</p>
      {sub && <p className="mt-1 text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Panel({ title, children, emptyHint }: { title: string; children?: React.ReactNode; emptyHint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{title}</p>
      {children}
      {emptyHint && <p className="text-xs text-slate-500">{emptyHint}</p>}
    </div>
  );
}
