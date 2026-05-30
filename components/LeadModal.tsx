'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, MessageCircle } from 'lucide-react';

// Jad's direct WhatsApp — the broker buyers reach for instant contact.
const JAD_WHATSAPP = '971585276222';
import type { PublicListing } from '@/lib/listings';
import { buildEnquiryText } from '@/lib/listings';
import { formatAED, dropPct, dropColor, bedsLabel, imageUrl, formatSqm } from '@/lib/format';
import ImageCarousel from './ImageCarousel';

const FOCUSABLE_SEL =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export default function LeadModal({
  listing,
  onClose,
}: {
  listing: PublicListing;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Per FIX-04: validation hints only appear after the user has tried to
  // submit at least once. Field-level red borders are wired separately on
  // blur of empty required fields.
  const [submitted, setSubmitted] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  // The dialog is rendered into a portal on document.body (see bottom of this
  // component). Tracking mount lets us avoid touching `document` during SSR and
  // run autofocus only once the portal content is actually in the DOM.
  const [mounted, setMounted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) nameRef.current?.focus();
  }, [mounted]);

  useEffect(() => {
    // Remember whatever had focus before the modal opened, so we can restore
    // it on close (typically the row/card that triggered the inquiry).
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Focus trap — cycle Tab / Shift-Tab within the dialog.
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SEL),
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    // Hide the rest of the page from assistive tech while the dialog is open.
    const main = document.querySelector('main');
    const nav = document.querySelector('header');
    const footer = document.querySelector('footer');
    const hidden: HTMLElement[] = [];
    [main, nav, footer].forEach((el) => {
      if (el instanceof HTMLElement) {
        el.setAttribute('aria-hidden', 'true');
        // `inert` isn't honoured everywhere yet, but it's a no-op where unsupported.
        el.setAttribute('inert', '');
        hidden.push(el);
      }
    });

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      hidden.forEach((el) => {
        el.removeAttribute('aria-hidden');
        el.removeAttribute('inert');
      });
      // Restore focus to whatever opened the modal.
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name || !phone || !consent) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Send only the opaque id — the raw PF ref never reaches the browser,
        // so it can't be echoed back here. The server resolves the id to the
        // real listing.
        body: JSON.stringify({ name, phone, message, listing_id: listing.opaqueId, consent }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        // Server returned an error — most commonly the 429 daily limit. Show it
        // inline rather than pretending the inquiry went through.
        const friendly =
          res.status === 429
            ? (data.message ?? "You've reached today's inquiry limit. Try again tomorrow.")
            : (data.message ?? data.error ?? "Couldn't send. Please try again.");
        setSubmitting(false);
        setErrorMsg(friendly);
        return;
      }
      setSubmitting(false);
      setDone(true);
      setTimeout(onClose, 3200);
    } catch {
      setSubmitting(false);
      setErrorMsg("Couldn't reach the server. Check your connection and retry.");
    }
  }

  // FIX-01: only show the Δ-vs-OP figure when a real Original Price is known.
  // After the OP-nullability fix a row may have originalPrice null/0/equal to
  // current; dropPct on those yields Infinity/NaN/0%. Mirror the table's guard
  // so a buyer never sees "Infinity% vs OP".
  const op = listing.originalPrice as number | null | undefined;
  const opKnown =
    op != null && Number.isFinite(op) && op > 0 && op !== listing.currentPrice;
  const delta = opKnown ? dropPct(listing.currentPrice, op as number) : null;
  // FIX-05: `??` only triggers on null/undefined — DB-sourced rows have
  // imageUrl='' (empty string), which would fall through to a broken
  // Unsplash URL built from an empty imageId. Use a truthy check and bail
  // out to a CSS-only grey box when neither source is usable.
  const thumbSrc = listing.imageUrl || (listing.imageId ? imageUrl(listing.imageId, 200) : '');
  // Gallery: prefer the full multi-image array; fall back to the single
  // resolvable image so older rows still render one photo.
  const gallery = listing.imageUrls?.length ? listing.imageUrls : thumbSrc ? [thumbSrc] : [];

  // FIX-06: header concatenates project + subLocation, but upstream sometimes
  // passes the community as subLocation when they're identical (e.g. "Terra
  // Heights, Terra Heights"). Dedupe case-insensitively. Same logic guards
  // developer/community echoes on the secondary meta line.
  const project = listing.project ?? '';
  const sub = listing.subLocation ?? '';
  const heading =
    sub && sub.trim().toLowerCase() !== project.trim().toLowerCase()
      ? `${project}, ${sub}`
      : project;
  const community = listing.community ?? '';
  const developer = listing.developer ?? '';
  const metaParts = [
    developer,
    community && community.trim().toLowerCase() !== developer.trim().toLowerCase()
      ? community
      : '',
  ].filter(Boolean);
  const metaLine = metaParts.join(' · ');

  // Field-level error states (FIX-04): red border once a required field has
  // been touched while empty, OR after a submit attempt with that field empty.
  const nameError = (nameTouched || submitted) && !name;
  const phoneError = (phoneTouched || submitted) && !phone;
  const showErrorHint = submitted && (!name || !phone || !consent) && !submitting;

  // Direct-contact path: pre-fill a WhatsApp message to Jad referencing this
  // exact unit so he can identify it instantly. This is an alternative to the
  // lead form — no sign-up required.
  //
  // SECURITY/PRIVACY: the enquiry must NOT leak the source PF reference number.
  // buildEnquiryText embeds the opaque internal id (u-xxxxxx) only — the same
  // id Jad and we use to look up the listing on our side.
  const waText = encodeURIComponent(buildEnquiryText(listing, heading));
  const waHref = `https://wa.me/${JAD_WHATSAPP}?text=${waText}`;

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-title"
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-t-2xl sm:rounded-lg bg-white p-5 shadow-modal dark:bg-slate-900 max-h-[92vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute end-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <X size={18} />
        </button>

        {done ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto text-green-600 dark:text-green-400" size={48} />
            <h3 className="mt-3 text-lg font-semibold">Thanks. Jad will WhatsApp you shortly.</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Usually within the hour during business hours.</p>
          </div>
        ) : (
          <>
            <h3 id="lead-title" className="text-lg font-semibold pe-8">Get details on this unit</h3>

            {gallery.length > 0 && (
              <ImageCarousel
                images={gallery}
                alt={heading || listing.project}
                sizes="(min-width: 640px) 28rem, 100vw"
                priority
                // `modal-hero` names this element for the View Transitions API
                // (globals.css → view-transition-name: lead-hero) so the modal
                // hero morphs in/out smoothly on supporting browsers.
                className="modal-hero mt-4 aspect-[4/3] w-full rounded-lg"
              />
            )}

            <div className="mt-4 rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{heading}</p>
                {metaLine && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">{metaLine}</p>
                )}
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {listing.unitType ?? bedsLabel(listing.beds)}{listing.bathrooms ? ` · ${listing.bathrooms} Bath` : ''} · {formatSqm(listing.sqft)}
                </p>
                {listing.handover && listing.type === 'off_plan' && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">Handover: {listing.handover}{listing.paymentStatus ? ` · ${listing.paymentStatus}` : ''}</p>
                )}
                {listing.features && listing.features.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {listing.features.slice(0, 4).map((f) => (
                      <span key={f} className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">{f}</span>
                    ))}
                  </div>
                )}
                <p className="mt-2 font-mono text-sm tabular-nums">
                  AED {formatAED(listing.currentPrice)}
                  {delta !== null && (
                    <>
                      {' '}
                      <span className={`font-semibold ${dropColor(delta)}`}>{delta.toFixed(1)}%</span>
                      <span className="ms-1 text-xs text-slate-600 dark:text-slate-400">vs OP</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-3">
              <Field label="Your name">
                <input
                  ref={nameRef}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  autoComplete="name"
                  aria-invalid={nameError || undefined}
                  className={`block w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:bg-slate-800 ${
                    nameError
                      ? 'border-red-500 dark:border-red-500'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                  placeholder="Sara A."
                />
              </Field>
              <Field label="WhatsApp number">
                <div className="flex">
                  <span className="inline-flex items-center rounded-s-md border border-e-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">+971</span>
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => setPhoneTouched(true)}
                    aria-invalid={phoneError || undefined}
                    className={`block w-full rounded-e-md border bg-white px-3 py-2 text-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:bg-slate-800 ${
                      phoneError
                        ? 'border-red-500 dark:border-red-500'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                    placeholder="50 123 4567"
                  />
                </div>
              </Field>
              <Field label="Message (optional)">
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:bg-slate-800"
                  placeholder="Available to view this weekend?"
                />
              </Field>
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus-visible:ring-brand"
                />
                <span>I agree to the privacy notice & terms.</span>
              </label>
              {errorMsg && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                >
                  {errorMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={!name || !phone || !consent || submitting}
                className="w-full rounded-md bg-brand py-2.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
              >
                {submitting ? 'Sending…' : 'Request details'}
              </button>
              {showErrorHint && (
                <p
                  aria-live="polite"
                  className="text-center text-[11px] text-amber-700 dark:text-amber-400"
                >
                  {!name && 'Name required · '}
                  {!phone && 'WhatsApp number required · '}
                  {!consent && 'Tick the consent box'}
                </p>
              )}

              <div className="flex items-center gap-3 py-1" aria-hidden>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                <span className="text-[11px] uppercase tracking-wide text-slate-400">or</span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </div>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] py-2.5 text-sm font-medium text-white transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#25D366]"
              >
                <MessageCircle size={16} /> Message Jad directly on WhatsApp
              </a>

              <p className="text-center text-xs text-slate-600 dark:text-slate-400">We&apos;ll WhatsApp you back within the hour.</p>
            </form>
          </>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(dialog, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</span>
      {children}
    </label>
  );
}
