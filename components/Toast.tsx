'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({
  message,
  onClose,
  variant = 'success',
}: {
  message: string;
  onClose: () => void;
  variant?: 'success' | 'info' | 'error';
}) {
  const t = useTranslations('toast');
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  // Icon + accent must match the variant — an error toast showing a green
  // success checkmark is misleading, so map both colour and glyph together.
  const { tone, Icon, iconColor } =
    variant === 'success'
      ? { tone: 'border-s-green-600', Icon: CheckCircle2, iconColor: 'text-green-600 dark:text-green-400' }
      : variant === 'error'
      ? { tone: 'border-s-red-600', Icon: AlertCircle, iconColor: 'text-red-600 dark:text-red-400' }
      : { tone: 'border-s-blue-600', Icon: Info, iconColor: 'text-blue-600 dark:text-blue-400' };

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`fixed bottom-4 end-4 z-50 flex max-w-xs items-start gap-3 rounded-md border border-slate-200 border-s-4 ${tone} bg-white p-3 shadow-modal dark:border-slate-700 dark:bg-slate-800`}
    >
      <Icon className={`mt-0.5 shrink-0 ${iconColor}`} size={18} />
      <p className="text-sm text-slate-800 dark:text-slate-100 flex-1">{message}</p>
      <button onClick={onClose} aria-label={t('dismiss')} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
        <X size={16} />
      </button>
    </div>
  );
}
