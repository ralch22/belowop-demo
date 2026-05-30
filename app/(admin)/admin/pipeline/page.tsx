/**
 * /admin/pipeline — single-glance "is the data pipeline alive?" dashboard.
 *
 * Surfaces data from migrations 0003 (ingestion_runs) and 0004 (stale-pruning).
 * Pairs with the watchdog cron (task #68) which uses the same queries to fire
 * Telegram alerts on prolonged staleness.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin-auth';
import {
  ingestionFreshness,
  recentIngestionRuns,
  pruningRisk,
  isDbConfigured,
  type IngestionRunRow,
  type IngestionFreshness,
  type PruningRisk,
} from '@/lib/db';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pipeline · Below OP admin',
};

// Health thresholds. Mirror task #68 watchdog cron rules so /admin/pipeline
// shows red BEFORE the cron pings (the dashboard is the leading indicator).
const STALE_RUN_HOURS = 26;        // >26h since last run  → critical
const STALE_DATA_HOURS = 48;       // >48h since last new listing → warn
const WARN_RUN_HOURS = 12;         // >12h since last run  → warn

export default async function PipelinePage() {
  if (!isAdmin()) redirect('/admin/login');

  if (!isDbConfigured()) {
    return (
      <Shell>
        <EmptyDb />
      </Shell>
    );
  }

  const [freshness, runs, pruning] = await Promise.all([
    ingestionFreshness(),
    recentIngestionRuns(50),
    pruningRisk(),
  ]);

  return (
    <Shell>
      <FreshnessCard f={freshness} />
      <PruningCard p={pruning} />
      <RunsTable runs={runs} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-brand font-semibold">Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-xs text-slate-500">
            Is the data flowing? One glance answer below.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-slate-600 hover:text-brand dark:text-slate-400"
        >
          ← Admin home
        </Link>
      </div>
      {children}
    </div>
  );
}

function FreshnessCard({ f }: { f: IngestionFreshness }) {
  const hoursSinceRun = f.last_run_started_at
    ? (Date.now() - new Date(f.last_run_started_at).getTime()) / 3.6e6
    : Infinity;
  const hoursSinceData = f.last_new_listing_at
    ? (Date.now() - new Date(f.last_new_listing_at).getTime()) / 3.6e6
    : Infinity;

  const runHealth: Health =
    hoursSinceRun > STALE_RUN_HOURS ? 'critical' :
    hoursSinceRun > WARN_RUN_HOURS ? 'warn' :
    'ok';

  const dataHealth: Health =
    hoursSinceData > STALE_DATA_HOURS ? 'warn' :
    'ok';

  const overall: Health =
    runHealth === 'critical' ? 'critical' :
    runHealth === 'warn' || dataHealth === 'warn' ? 'warn' :
    'ok';

  return (
    <section className={`rounded-lg border p-5 shadow-card ${healthBorder(overall)}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            <HealthDot h={overall} /> Pipeline freshness
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Counts from <code className="font-mono text-xs">v_ingestion_freshness</code>.
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthBadge(overall)}`}>
          {overall === 'ok' ? 'Healthy' : overall === 'warn' ? 'Degraded' : 'Stale'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Stat
          label="Last run"
          value={f.last_run_started_at ? relativeTime(f.last_run_started_at) : 'never'}
          sub={`${f.runs_24h} in 24h`}
          health={runHealth}
        />
        <Stat
          label="Last success"
          value={f.last_success_at ? relativeTime(f.last_success_at) : 'never'}
          sub={`${f.successes_24h} ok in 24h`}
        />
        <Stat
          label="Last new listing"
          value={f.last_new_listing_at ? relativeTime(f.last_new_listing_at) : 'never'}
          sub={`${f.new_listings_24h} added 24h`}
          health={dataHealth}
        />
        <Stat
          label="Active listings"
          value={f.active_listings_total.toLocaleString()}
          sub={`${f.updates_24h} updated · ${f.withdrawn_24h} withdrawn (24h)`}
        />
      </div>
    </section>
  );
}

function PruningCard({ p }: { p: PruningRisk }) {
  const atRisk = p.would_withdraw > 0;
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Stale-listing pruning state
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Listings get auto-withdrawn after <strong>2 consecutive misses</strong> from Apify runs.
      </p>
      <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Stat label="1-miss buffer" value={p.one_miss.toLocaleString()} sub="next-run withdrawal risk" />
        <Stat
          label="Will withdraw next"
          value={p.would_withdraw.toLocaleString()}
          health={atRisk ? 'warn' : 'ok'}
          sub="≥ 2 misses, awaiting next cron"
        />
        <Stat label="Fresh ≤ 24h" value={p.fresh_24h.toLocaleString()} sub="seen recently" />
        <Stat label="Never re-seen" value={p.never_re_seen.toLocaleString()} sub="pre-pruning baseline" />
      </div>
    </section>
  );
}

function RunsTable({ runs }: { runs: IngestionRunRow[] }) {
  if (runs.length === 0) {
    return (
      <section className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
        <p>No ingestion runs recorded yet.</p>
        <p className="mt-1 text-xs">
          The next Apify webhook hit will land here. Scheduled every 6h.
        </p>
      </section>
    );
  }
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <header className="border-b border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Recent ingestion runs
        </h2>
        <p className="mt-1 text-xs text-slate-500">Last {runs.length}, newest first.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Received</th>
              <th className="px-4 py-2 text-right">+ New</th>
              <th className="px-4 py-2 text-right">↑ Upd</th>
              <th className="px-4 py-2 text-right">= Unch</th>
              <th className="px-4 py-2 text-right">– Wd</th>
              <th className="px-4 py-2 text-right">⚠ Err</th>
              <th className="px-4 py-2 text-left">Actor / Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2 align-top whitespace-nowrap">
                  {relativeTime(r.started_at)}
                </td>
                <td className="px-4 py-2 align-top">
                  <StatusBadge s={r.status} />
                </td>
                <td className="px-4 py-2 align-top text-right tabular-nums">{r.items_received}</td>
                <td className="px-4 py-2 align-top text-right tabular-nums">{r.items_inserted}</td>
                <td className="px-4 py-2 align-top text-right tabular-nums">{r.items_updated}</td>
                <td className="px-4 py-2 align-top text-right tabular-nums text-slate-400">
                  {r.items_unchanged}
                </td>
                <td className="px-4 py-2 align-top text-right tabular-nums">{r.items_withdrawn}</td>
                <td className={`px-4 py-2 align-top text-right tabular-nums ${r.items_errored > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                  {r.items_errored}
                </td>
                <td className="px-4 py-2 align-top text-xs text-slate-500">
                  {r.error_text
                    ? <span className="text-red-600">{r.error_text}</span>
                    : (r.actor_name ?? '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyDb() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500 dark:border-slate-700">
      <p>Database not configured.</p>
    </div>
  );
}

type Health = 'ok' | 'warn' | 'critical';

function HealthDot({ h }: { h: Health }) {
  const colour =
    h === 'ok' ? 'bg-green-500' :
    h === 'warn' ? 'bg-amber-500' :
    'bg-red-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${colour} mr-2 align-middle`} />;
}

function healthBorder(h: Health): string {
  if (h === 'ok') return 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
  if (h === 'warn') return 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30';
  return 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30';
}

function healthBadge(h: Health): string {
  if (h === 'ok') return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
  if (h === 'warn') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
}

function Stat({
  label,
  value,
  sub,
  health,
}: {
  label: string;
  value: string;
  sub?: string;
  health?: Health;
}) {
  const valueClass =
    health === 'critical' ? 'text-red-700 dark:text-red-300' :
    health === 'warn'     ? 'text-amber-700 dark:text-amber-300' :
    'text-slate-900 dark:text-slate-100';
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ s }: { s: IngestionRunRow['status'] }) {
  const map = {
    running:   { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', label: 'running' },
    succeeded: { cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', label: 'ok' },
    partial:   { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'partial' },
    failed:    { cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'failed' },
  } as const;
  const cfg = map[s];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>{cfg.label}</span>;
}
