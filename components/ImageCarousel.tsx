'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A self-contained image gallery for a single listing.
 *
 * Used in two contexts:
 *   - inside ListingCard, which is itself a role="button" that opens the lead
 *     modal on click / Enter / Space, and
 *   - inside LeadModal, which installs a window-level keydown handler for an
 *     Escape-to-close + Tab focus-trap.
 *
 * EVENT-HANDLING CONTRACT (do not "simplify" this):
 *   - The prev/next buttons call e.stopPropagation() on **onClick only**, so a
 *     click on an arrow advances the gallery without also triggering the parent
 *     card's inquire handler.
 *   - We deliberately DO NOT stopPropagation on keydown. The modal's focus-trap
 *     and Escape handler live on `window`; swallowing keydown here would break
 *     them. The card, for its part, guards its own onKeyDown with
 *     `e.target !== e.currentTarget` so arrow-key focus on a gallery button
 *     never opens the modal.
 *   - The overlay (price/type badges) is rendered last and is pointer-events-none
 *     so it never intercepts clicks meant for the arrows or the card.
 */
export default function ImageCarousel({
  images,
  alt,
  sizes,
  priority = false,
  className = '',
  overlay,
}: {
  images: string[];
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  overlay?: React.ReactNode;
}) {
  const t = useTranslations('carousel');
  // Under RTL the gallery flows right→left, so the chevron glyphs and swipe
  // direction must mirror even though the button *positions* (start-2/end-2)
  // already flip via logical properties.
  const rtl = useLocale() === 'ar';
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  const safe = images.filter(Boolean);
  const n = safe.length;
  const [i, setI] = useState(0);
  // Touch-swipe bookkeeping (mobile). Null when no gesture is in progress.
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Clamp the index defensively in case `images` shrinks between renders.
  const idx = n > 0 ? Math.min(i, n - 1) : 0;

  if (n === 0) {
    return (
      <div
        className={`relative overflow-hidden bg-slate-200 dark:bg-slate-800 ${className}`}
        aria-hidden
      >
        {overlay}
      </div>
    );
  }

  const go = (next: number) => setI(((next % n) + n) % n);
  const prev = () => go(idx - 1);
  const advance = () => go(idx + 1);

  return (
    <div
      className={`relative overflow-hidden bg-slate-200 dark:bg-slate-800 ${className}`}
      onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchStartX === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
        if (Math.abs(dx) > 40) {
          // LTR: swipe-left → next. RTL: swipe-left → prev (mirror the flow).
          const swipedLeft = dx < 0;
          if (swipedLeft !== rtl) advance();
          else prev();
        }
        setTouchStartX(null);
      }}
    >
      <Image
        key={safe[idx]}
        src={safe[idx]}
        alt={n > 1 ? t('photoOfTotal', { alt, current: String(idx + 1), total: String(n) }) : alt}
        fill
        sizes={sizes}
        priority={priority && idx === 0}
        loading={priority && idx === 0 ? undefined : 'lazy'}
        className="object-cover"
      />

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label={t('previousPhoto')}
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute start-2 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-slate-800 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:bg-slate-900/80 dark:text-slate-100"
          >
            <PrevIcon size={18} />
          </button>
          <button
            type="button"
            aria-label={t('nextPhoto')}
            onClick={(e) => {
              e.stopPropagation();
              advance();
            }}
            className="absolute end-2 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-slate-800 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:bg-slate-900/80 dark:text-slate-100"
          >
            <NextIcon size={18} />
          </button>

          <div className="absolute bottom-2 end-2 z-10 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur">
            {idx + 1}/{n}
          </div>

          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {safe.map((src, k) => (
              <button
                key={src}
                type="button"
                aria-label={t('goToPhoto', { index: String(k + 1) })}
                aria-current={k === idx || undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  go(k);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  k === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </>
      )}

      {overlay}
    </div>
  );
}
