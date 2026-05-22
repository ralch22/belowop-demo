import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { isAdmin } from '@/lib/admin-auth';
import { isDbConfigured } from '@/lib/db';
import { formatWhatsapp, formatTelegram, brokerWhatsappNumber, type AlertContext } from '@/lib/alert-format';
import { dropPct, formatAED, imageUrl } from '@/lib/format';
import { listings as seedListings } from '@/lib/listings';

export const dynamic = 'force-dynamic';

interface ListingRow {
  external_ref: string;
  project: string;
  developer: string | null;
  community: string;
  sub_location: string | null;
  type: 'off_plan' | 'ready';
  beds: string;
  bathrooms: number | null;
  sqft: number;
  current_price: number;
  original_price: number;
  unit_type: string | null;
  features: string[] | null;
  view: string | null;
  floor_position: string | null;
  handover: string | null;
  payment_status: string | null;
  blob_image_urls: string[] | null;
  source_image_urls: string[] | null;
}

async function loadListings(): Promise<ListingRow[]> {
  if (!isDbConfigured()) return [];
  try {
    const r = await sql<ListingRow>`
      SELECT external_ref, project, developer, community, sub_location, type, beds, bathrooms, sqft,
             current_price, original_price, unit_type, features, view, floor_position, handover, payment_status,
             blob_image_urls, source_image_urls
      FROM listings
      ORDER BY updated_at DESC
      LIMIT 100;`;
    return r.rows;
  } catch {
    return [];
  }
}

function buildCtx(l: ListingRow, webUrl: string): AlertContext {
  const delta = dropPct(Number(l.current_price), Number(l.original_price));
  return {
    project: l.project,
    community: l.community,
    subLocation: l.sub_location,
    unitType: l.unit_type,
    beds: l.beds,
    bathrooms: l.bathrooms,
    sqft: l.sqft,
    features: l.features ?? [],
    view: l.view,
    floorPosition: l.floor_position,
    handover: l.handover,
    paymentStatus: l.payment_status,
    developer: l.developer,
    type: l.type,
    current: Number(l.current_price),
    original: Number(l.original_price),
    dropPct: delta,
    webUrl,
  };
}

function firstImage(l: ListingRow): string | null {
  if (l.blob_image_urls && l.blob_image_urls.length > 0) return l.blob_image_urls[0];
  if (l.source_image_urls && l.source_image_urls.length > 0) return l.source_image_urls[0];
  // Demo fallback: synthesize from the seed
  const seed = seedListings.find((s) => s.ref === l.external_ref);
  return seed ? imageUrl(seed.imageId, 1200) : null;
}

export default async function AlertPreviewPage({ searchParams }: { searchParams: { ref?: string } }) {
  if (!isAdmin()) redirect('/admin/login');
  const all = await loadListings();
  const ref = searchParams.ref ?? all[0]?.external_ref;
  const listing = all.find((l) => l.external_ref === ref);
  const webUrl = 'https://belowop-demo.vercel.app';
  const ctx = listing ? buildCtx(listing, webUrl) : null;

  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alert preview</h1>
          <p className="text-xs text-slate-500 mt-1">
            Renders the exact WhatsApp + Telegram payload that <Link href="/api/alerts/dispatch" className="font-mono text-brand hover:underline">/api/alerts/dispatch</Link> sends.
            Same code path, just doesn&apos;t mark events as dispatched.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-slate-600 hover:text-brand dark:text-slate-400">← back to admin</Link>
      </div>

      {/* Listing picker */}
      <form method="GET" className="mt-6">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Pick a listing ({all.length} in DB)
        </label>
        <div className="flex gap-2">
          <select
            name="ref"
            defaultValue={ref}
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
          >
            {all.map((l) => (
              <option key={l.external_ref} value={l.external_ref}>
                {l.external_ref} · {l.project} ({l.community})
              </option>
            ))}
          </select>
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">
            Preview
          </button>
        </div>
      </form>

      {ctx && listing && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* WhatsApp */}
          <Phone label="WhatsApp" tone="green">
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-100">
              {firstImage(listing) && (
                <img
                  src={firstImage(listing)!}
                  alt={listing.project}
                  className="aspect-[1200/630] w-full rounded-lg object-cover"
                />
              )}
              <pre className="mt-2 text-[12px] leading-relaxed text-slate-900 whitespace-pre-wrap font-mono">
                {formatWhatsapp(ctx)}
              </pre>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Target template (Meta Cloud direct, deferred): <code className="font-mono">below_op_alert</code>{' '}
              ({ctx.dropPct < -0.01 ? 'price-drop variant' : 'new-listing variant'})
            </p>
          </Phone>

          {/* Telegram */}
          <Phone label="Telegram" tone="blue">
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-100">
              {firstImage(listing) && (
                <img
                  src={firstImage(listing)!}
                  alt={listing.project}
                  className="aspect-[1200/630] w-full rounded-lg object-cover"
                />
              )}
              <pre className="mt-2 text-[12px] leading-relaxed text-slate-900 whitespace-pre-wrap font-mono">
                {formatTelegram(ctx)}
              </pre>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">sendPhoto · MarkdownV2 parse mode</p>
          </Phone>
        </div>
      )}

      {/* Field debug */}
      {listing && (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold mb-3">Fields used</p>
          <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <Field label="Project" value={listing.project} />
            <Field label="Community" value={listing.community} />
            <Field label="Sub-location" value={listing.sub_location} />
            <Field label="Unit type" value={listing.unit_type} />
            <Field label="Bathrooms" value={listing.bathrooms} />
            <Field label="Size (sqft)" value={listing.sqft} />
            <Field label="Type" value={listing.type} />
            <Field label="Developer" value={listing.developer} />
            <Field label="Handover" value={listing.handover} />
            <Field label="Payment status" value={listing.payment_status} />
            <Field label="View" value={listing.view} />
            <Field label="Floor position" value={listing.floor_position} />
            <Field label="Current price" value={formatAED(Number(listing.current_price))} />
            <Field label="Original price" value={formatAED(Number(listing.original_price))} />
            <Field label="Δ vs OP" value={`${dropPct(Number(listing.current_price), Number(listing.original_price)).toFixed(1)}%`} />
            <Field label="WhatsApp CTA" value={`wa.me/${brokerWhatsappNumber()}`} />
          </div>
          {listing.features && listing.features.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Features</p>
              <div className="flex flex-wrap gap-1">
                {listing.features.map((f) => (
                  <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] dark:bg-slate-800">{f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Phone({ label, tone, children }: { label: string; tone: 'green' | 'blue'; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
      <div className={`mx-auto w-full max-w-sm rounded-[40px] border-8 ${tone === 'green' ? 'border-slate-800 bg-[#0a1014]' : 'border-slate-800 bg-[#17212b]'} p-4 shadow-modal`}>
        <div className="mb-3 flex items-center justify-between text-xs text-white">
          <span>9:41</span>
          <span className="font-medium">Below OP</span>
          <span>●●●</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-slate-100 py-1 dark:border-slate-800">
      <span className="text-slate-500 min-w-[110px]">{label}</span>
      <span className="font-mono text-slate-900 dark:text-slate-100 truncate">
        {value == null || value === '' ? <span className="text-slate-400">null</span> : String(value)}
      </span>
    </div>
  );
}
