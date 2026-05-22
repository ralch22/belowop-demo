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

export default function ListingTable({
  items,
  onInquire,
}: {
  items: Listing[];
  onInquire: (ref: string) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900 lg:block">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <tr>
            <th className="w-16 px-4 py-3"></th>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Area</th>
            <th className="px-4 py-3 text-center">Beds</th>
            <th className="px-4 py-3 text-right">Size</th>
            <th className="px-4 py-3 text-right">Price (AED)</th>
            <th className="px-4 py-3 text-right">AED / m²</th>
            <th className="px-4 py-3 text-right">Δ vs OP</th>
            <th className="w-32 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((l, idx) => {
            const delta = dropPct(l.currentPrice, l.originalPrice);
            const thumbSrc = l.imageUrl ?? imageUrl(l.imageId, 96);
            return (
              <tr
                key={l.ref}
                tabIndex={0}
                role="button"
                aria-label={`Inquire about ${l.project} in ${l.community}`}
                onClick={() => onInquire(l.ref)}
                onKeyDown={(e) => {
                  // Both Enter and Space activate, mirroring native <button>.
                  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    onInquire(l.ref);
                  }
                }}
                className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand dark:border-slate-800 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800"
              >
                <td className="px-4 py-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700">
                    <Image
                      src={thumbSrc}
                      alt={l.project}
                      fill
                      sizes="48px"
                      // First row is above-the-fold on the desktop table —
                      // prioritise it for LCP and lazy-load the rest.
                      priority={idx === 0}
                      loading={idx === 0 ? undefined : 'lazy'}
                      className="object-cover"
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {l.type === 'off_plan' ? (
                      <Hammer size={12} className="text-slate-500" aria-label="Off-plan" />
                    ) : (
                      <Key size={12} className="text-slate-500" aria-label="Ready" />
                    )}
                    <span className="font-medium text-slate-900 dark:text-slate-100">{l.project}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {l.developer} · {relativeTime(l.listedAt)}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{l.community}</td>
                <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">{bedsLabel(l.beds)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {formatSqm(l.sqft)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatAED(l.currentPrice)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {formatPricePerSqm(l.currentPrice, l.sqft)}
                </td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${dropColor(delta)}`}>
                  {delta.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onInquire(l.ref);
                    }}
                    aria-label={`Get details on ${l.project}`}
                    className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
                  >
                    Get details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
