import { listings, opaqueOf } from '@/lib/listings';
import { formatAED, dropPct, imageUrl, formatSqm } from '@/lib/format';
import { formatAedShort, formatUsdShort } from '@/lib/description-parser';

export default function AlertPreviewPage() {
  // Pick a richly-enriched off-plan listing for the preview.
  const sample = listings.find((l) => l.type === 'off_plan' && l.handover && (l.features?.length ?? 0) >= 3) ?? listings[0];
  const delta = dropPct(sample.currentPrice, sample.originalPrice);
  const dropAbs = Math.abs(delta).toFixed(0);
  const sqm = Math.round(sample.sqft * 0.092903);
  const beds = sample.beds === 'studio' ? 'Studio' : sample.beds === '4+' ? '4+ Bedroom' : `${sample.beds} Bedroom`;
  const unitType = sample.unitType ?? beds;
  const feats = (sample.features ?? []).slice(0, 5);
  const brokerWa = '971585276222';

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Alert message preview</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Below OP follows the canonical broker post template (Variables.pdf): project + features + handover + dual-currency + direct WhatsApp CTA.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Phone label="WhatsApp">
          <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-100">
            <img
              src={imageUrl(sample.imageId, 1200)}
              alt={sample.project}
              className="aspect-[1200/630] w-full rounded-lg object-cover"
            />
            <div className="mt-2 text-[13px] leading-relaxed text-slate-900 whitespace-pre-line font-mono">
{`🔴 *DISTRESS DEAL - Below OP* 🔴

📍 *${sample.project}${sample.subLocation ? ', ' + sample.subLocation : ''}*

• *${unitType}*${sample.bathrooms ? `\n• *${sample.bathrooms} Bathrooms*` : ''}
• ~*${sample.sqft.toLocaleString()} sqft*~ | ~*${sqm.toLocaleString()} sqm*~${feats.length >= 2 ? `\n• *${feats[0]}* | *${feats[1]}*` : feats.length === 1 ? `\n• *${feats[0]}*` : ''}${feats.slice(2, 5).map((f) => `\n• *${f}*`).join('')}

${sample.handover && sample.type === 'off_plan' ? `*Handover*: ${sample.handover}\n` : ''}*Developer*: *${sample.developer}*

*Selling Price*: *${formatAedShort(sample.currentPrice)} AED* | ${formatUsdShort(sample.currentPrice)} 🔥
📉 ${dropAbs}% below OP (was ${formatAedShort(sample.originalPrice)} AED)

For serious inquiries contact:
Wa.me/${brokerWa}
See all units → belowop-demo.vercel.app`}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-400">Preview only · WhatsApp 1:1 delivery via Meta Cloud API direct (deferred — see docs/WhatsApp-Integration-Plan.md)</p>
        </Phone>

        <Phone label="Telegram" tone="blue">
          <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-100">
            <img
              src={imageUrl(sample.imageId, 1200)}
              alt={sample.project}
              className="aspect-[1200/630] w-full rounded-lg object-cover"
            />
            <div className="mt-2 text-[13px] leading-relaxed text-slate-900 whitespace-pre-line font-mono">
{`🔴 *DISTRESS DEAL - Below OP* 🔴

📍 *${sample.project}${sample.subLocation ? ', ' + sample.subLocation : ''}*

• *${unitType}*${sample.bathrooms ? `\n• *${sample.bathrooms} Bathrooms*` : ''}
• ~${sample.sqft.toLocaleString()} sqft~ | ~${sqm.toLocaleString()} sqm~${feats.length >= 2 ? `\n• *${feats[0]}* | *${feats[1]}*` : feats.length === 1 ? `\n• *${feats[0]}*` : ''}${feats.slice(2, 5).map((f) => `\n• *${f}*`).join('')}

${sample.handover && sample.type === 'off_plan' ? `*Handover*: ${sample.handover}\n` : ''}*Developer*: *${sample.developer}*

*Selling Price*: *${formatAedShort(sample.currentPrice)} AED* | ${formatUsdShort(sample.currentPrice)} 🔥
📉 ${dropAbs}% below OP (was ${formatAedShort(sample.originalPrice)} AED)

`}
              <a className="text-blue-600 hover:underline" href={`https://wa.me/${brokerWa}`}>WhatsApp Jad</a>
              {'  ·  '}
              <a className="text-blue-600 hover:underline" href={`/?inquire=${opaqueOf(sample.ref)}`}>See all units</a>
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-400">sendPhoto + MarkdownV2 caption</p>
        </Phone>
      </div>

      <div className="mt-12 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <p className="font-semibold text-slate-900 dark:text-slate-100">Source of truth</p>
        <p className="mt-1 text-xs">
          Format derived from the broker&apos;s existing WhatsApp/Telegram template (<code className="font-mono">Variables.pdf</code>).
          Real alerts render the same content server-side via <code className="font-mono">/api/alerts/dispatch</code> and ship today via Telegram Bot API
          (channel <code className="font-mono">@DubaiPropertydeal</code> + 1:1 DMs to Rami). WhatsApp 1:1 delivery via Meta Cloud API direct is wired but deferred —
          see <code className="font-mono">docs/WhatsApp-Integration-Plan.md</code>. Image collage composed at <code className="font-mono">/api/og?u=…</code>.
        </p>
      </div>
    </div>
  );
}

function Phone({ label, tone = 'green', children }: { label: string; tone?: 'green' | 'blue'; children: React.ReactNode }) {
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
