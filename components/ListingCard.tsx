'use client';

import Image from 'next/image';
import type { Listing } from '@/lib/listings';
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

export default function ListingCard({
  listing,
  onInquire,
  priority = false,
}: {
  listing: Listing;
  onInquire: (ref: string) => void;
  priority?: boolean;
}) {
  const delta = dropPct(listing.currentPrice, listing.originalPrice);
  const src = listing.imageUrl ?? imageUrl(listing.imageId, 800);
  return (
    <article
      onClick={() => onInquire(listing.ref)}
      tabIndex={0}
      role="button"
      aria-label={`Inquire about ${listing.project} in ${listing.community}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          onInquire(listing.ref);
        }
      }}
      className="cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card transition active:shadow-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative aspect-[16/9] bg-slate-200 dark:bg-slate-800">
        <Image
          src={src}
          alt={listing.project}
          fill
          sizes="(min-width: 640px) 50vw, 100vw"
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          className="object-cover"
        />
        <div className={`absolute top-2 right-2 rounded-full bg-white/95 backdrop-blur px-2 py-0.5 text-xs font-mono font-semibold tabular-nums ${dropColor(delta)} dark:bg-slate-900/90`}>
          {delta.toFixed(1)}%
        </div>
        <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
          {listing.type === 'off_plan' ? <Hammer size={10} /> : <Key size={10} />}
          {listing.type === 'off_plan' ? 'Off-plan' : 'Ready'}
        </div>
      </div>
      <div className="p-4">
        <p className="line-clamp-1 font-medium text-slate-900 dark:text-slate-100">{listing.project}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{listing.developer}</p>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            AED {formatAED(listing.currentPrice)}
          </p>
          <p className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {formatPricePerSqm(listing.currentPrice, listing.sqft)}/m²
          </p>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          {listing.community} · {bedsLabel(listing.beds)} · {formatSqm(listing.sqft)} · {relativeTime(listing.listedAt)}
        </p>
      </div>
    </article>
  );
}
