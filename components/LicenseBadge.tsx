import { ShieldCheck, ShieldX, ShieldAlert, Clock } from 'lucide-react';
import clsx from 'clsx';
import type { LicenseTone } from '@/lib/rera';

/**
 * Pure, presentational RERA-licence status pill. Takes a pre-computed `tone`
 * (from lib/rera `licenseTone`) and an already-translated `label` so it stays
 * a Server Component and carries no i18n / date logic of its own — the caller
 * owns both, mirroring how the listing cards pass resolved strings down.
 */
const TONE_STYLES: Record<LicenseTone, string> = {
  active:
    'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-400/20',
  expiring:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20',
  expired:
    'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-400/20',
  unknown:
    'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20',
};

const TONE_ICON: Record<LicenseTone, typeof ShieldCheck> = {
  active: ShieldCheck,
  expiring: Clock,
  expired: ShieldX,
  unknown: ShieldAlert,
};

export default function LicenseBadge({
  tone,
  label,
  size = 'md',
}: {
  tone: LicenseTone;
  label: string;
  size?: 'sm' | 'md';
}) {
  const Icon = TONE_ICON[tone];
  const sm = size === 'sm';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset',
        sm ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        TONE_STYLES[tone],
      )}
    >
      <Icon size={sm ? 12 : 14} aria-hidden />
      {label}
    </span>
  );
}
