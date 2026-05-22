'use client';

/**
 * S-09 — Custom PWA install prompt.
 *
 * Per UI.md §7.3:
 *  - Track visit count + dismissal in localStorage (30-day TTL).
 *  - Show on 2nd visit only, after 30s on S-01 (the listings index).
 *  - Listen for the browser's `beforeinstallprompt` event, defer it, and
 *    surface our own UI. iOS Safari never fires that event, so we render
 *    an iOS-specific instructional variant instead.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X, Download } from 'lucide-react';

const VISIT_KEY = 'belowop-visit-count';
const DISMISSED_KEY = 'belowop-install-dismissed-at';
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VISIT_TTL_MS = 60 * 60 * 1000; // a "visit" decays after an hour of inactivity
const VISIT_TS_KEY = 'belowop-visit-last';
const MIN_DWELL_MS = 30_000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari uses `navigator.standalone`; everyone else uses the media query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function bumpVisitCount(): number {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(VISIT_TS_KEY) || 0);
    const count = Number(localStorage.getItem(VISIT_KEY) || 0);
    // Only count as a new visit if more than VISIT_TTL_MS has passed since the last one.
    if (now - last > VISIT_TTL_MS) {
      const next = count + 1;
      localStorage.setItem(VISIT_KEY, String(next));
      localStorage.setItem(VISIT_TS_KEY, String(now));
      return next;
    }
    return count;
  } catch {
    return 0;
  }
}

function wasRecentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone() || wasRecentlyDismissed()) return;

    // Only the listings index (S-01) is eligible.
    if (pathname !== '/') return;

    const visitCount = bumpVisitCount();
    if (visitCount < 2) return;

    let timer: number | undefined;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      timer = window.setTimeout(() => setVisible(true), MIN_DWELL_MS);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari path: never fires beforeinstallprompt, so schedule the
    // instructional variant on the same dwell timer.
    if (isIOS()) {
      setIosMode(true);
      timer = window.setTimeout(() => setVisible(true), MIN_DWELL_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      if (timer) window.clearTimeout(timer);
    };
  }, [pathname]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  const accept = useCallback(async () => {
    if (!deferred) {
      // iOS — there's nothing programmatic to do; the modal just shows the
      // share-sheet instructions. Treat closing as "got it".
      dismiss();
      return;
    }
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setVisible(false);
  }, [deferred, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-prompt-title"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-modal dark:border-slate-700 dark:bg-slate-900 sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Download size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p id="install-prompt-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Install Below OP
          </p>
          {iosMode ? (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Tap the Share icon, then choose <span className="font-medium">&ldquo;Add to Home Screen&rdquo;</span> to install.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Get instant access from your home screen, with offline support.
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:hover:bg-slate-800"
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={dismiss}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Not now
        </button>
        <button
          onClick={accept}
          className="flex-1 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
        >
          {iosMode ? 'Got it' : 'Install'}
        </button>
      </div>
    </div>
  );
}
