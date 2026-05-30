'use client';

import { useTranslations } from 'next-intl';
import type { PublicListing } from '@/lib/listings';
import { safeProjectName } from '@/lib/op-parser';
import {
  formatAED,
  dropPct,
  dropColor,
  bedsLabel,
  relativeTime,
  imageUrl,
  formatSqm,
  formatPricePerSqm,
} from '@/lib/format';
import { Hammer, Key } from 'lucide-react';
import ImageCarousel from './ImageCarousel';

/**
 * True if the listing has a parsed OP distinct from the current price (FIX-01).
 * Defensive against null/undefined/zero/equal sentinels — keeps the renderer
 * working regardless of which path Agent A took at the parser layer.
 */
function hasKnownOp(l: PublicListing): boolean {
  const op = l.originalPrice as number | null | undefined;
  if (op == null) return false;
  if (!Number.isFinite(op) || op <= 0) return false;
  if (op === l.currentPrice) return false;
  return true;
}

export default function ListingCard({
  listing,
  onInquire,
  priority = false,
}: {
  listing: PublicListing;
  onInquire: (opaqueId: string) => void;
  priority?: boolean;
}) {
  const t = useTranslations('card');
  const known = hasKnownOp(listing);
  const delta = known ? dropPct(listing.currentPrice, listing.originalPrice as number) : null;
  const src = listing.imageUrl ?? imageUrl(listing.imageId, 800);
  // Full gallery when available; otherwise the single resolvable image.
  const gallery = listing.imageUrls?.length ? listing.imageUrls : [src].filter(Boolean);
  const project = safeProjectName(listing.project, listing.community);
  return (
    <article
      onClick={() => onInquire(listing.opaqueId)}
      tabIndex={0}
      role="button"
      aria-label={t('inquireAbout', { project: project ?? listing.community, community: listing.community })}
      onKeyDown={(e) => {
        // Only the card itself should open the modal on Enter/Space. The
        // carousel's arrow/dot buttons live inside the card; when one of them
        // has focus, e.target !== e.currentTarget — let their own handlers run
        // so paging a gallery never fires the inquire action.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          onInquire(listing.opaqueId);
        }
      }}
      className="cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card transition active:shadow-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-800 dark:bg-slate-900"
    >
      <ImageCarousel
        images={gallery}
        alt={project ?? listing.community}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        priority={priority}
        className="aspect-[16/9]"
        overlay={
          <>
            {delta !== null && (
              <div
                className={`pointer-events-none absolute top-2 end-2 z-10 rounded-full bg-white/95 px-2 py-0.5 text-xs font-mono font-semibold tabular-nums backdrop-blur ${dropColor(
                  delta,
                )} dark:bg-slate-900/90`}
              >
                {t('vsOp', { pct: delta.toFixed(1) })}
              </div>
            )}
            <div className="pointer-events-none absolute top-2 start-2 z-10 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
              {listing.type === 'off_plan' ? <Hammer size={10} /> : <Key size={10} />}
              {listing.type === 'off_plan' ? t('offPlan') : t('ready')}
            </div>
          </>
        }
      />
      <div className="p-4">
        <p className="line-clamp-1 font-medium text-slate-900 dark:text-slate-100">
          {project ?? '—'}
        </p>
        {listing.developer ? (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{listing.developer}</p>
        ) : null}
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            AED {formatAED(listing.currentPrice)}
          </p>
          <p className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {formatPricePerSqm(listing.currentPrice, listing.sqft)}/m²
          </p>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          {listing.community} · {bedsLabel(listing.beds)} · {formatSqm(listing.sqft)} ·{' '}
          {relativeTime(listing.listedAt)}
        </p>
      </div>
    </article>
  );
}
