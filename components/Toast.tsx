'use client';

import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

export default function Toast({
  message,
  onClose,
  variant = 'success',
}: {
  message: string;
  onClose: () => void;
  variant?: 'success' | 'info' | 'error';
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const tone =
    variant === 'success'
      ? 'border-l-green-600'
      : variant === 'error'
      ? 'border-l-red-600'
      : 'border-l-blue-600';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 flex max-w-xs items-start gap-3 rounded-md border border-slate-200 border-l-4 ${tone} bg-white p-3 shadow-modal dark:border-slate-700 dark:bg-slate-800`}
    >
      <CheckCircle2 className="mt-0.5 text-green-600 dark:text-green-400 shrink-0" size={18} />
      <p className="text-sm text-slate-800 dark:text-slate-100 flex-1">{message}</p>
      <button onClick={onClose} aria-label="Dismiss" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
        <X size={16} />
      </button>
    </div>
  );
}
