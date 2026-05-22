'use client';

import { useEffect, useState } from 'react';
import { Copy, Image as ImageIcon, ExternalLink, RefreshCw, CheckCircle2, MessageSquare } from 'lucide-react';

interface Item {
  ref: string;
  project: string;
  community: string;
  currentPrice: number;
  dropPct: number;
  type: 'off_plan' | 'ready';
  handover: string | null;
  caption: string;
  ogUrl: string;
  alertEventId: number | null;
}

type Source = 'pending' | 'recent';

export default function RelayPanel() {
  const [source, setSource] = useState<Source>('pending');
  const [items, setItems] = useState<Item[]>([]);
  const [channelUrl, setChannelUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const token = window.sessionStorage.getItem('belowop_admin_token') ?? window.prompt('Admin token:');
      if (!token) return;
      window.sessionStorage.setItem('belowop_admin_token', token);
      const res = await fetch(`/api/admin/relay?source=${source}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setItems(data.items);
      setChannelUrl(data.channel_url || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  async function copyText(item: Item) {
    await navigator.clipboard.writeText(item.caption);
    setCopiedRef(item.ref);
    setTimeout(() => setCopiedRef(null), 2000);
  }

  function downloadHero(item: Item) {
    // Trigger a browser download of the OG card image.
    const a = document.createElement('a');
    a.href = item.ogUrl;
    a.download = `${item.ref}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function openChannel() {
    if (!channelUrl) {
      alert('WHATSAPP_CHANNEL_URL not set on Vercel — add it to env vars.');
      return;
    }
    window.open(channelUrl, '_blank', 'noopener,noreferrer');
  }

  function aedShort(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">WhatsApp Channel relay</h2>
          <p className="text-[11px] text-slate-500 mt-1">
            WhatsApp Channels have no API — this prepares each alert for one-tap manual paste into{' '}
            {channelUrl ? (
              <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                @DubaiPropertydeal
              </a>
            ) : (
              <em>(no channel URL set)</em>
            )}
            . Telegram is fully automated; this surface is only for the WhatsApp Channel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md bg-slate-100 p-1 dark:bg-slate-800">
            {(['pending', 'recent'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  source === s
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {s === 'pending' ? 'Pending alerts' : 'Recent listings'}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openChannel}
            disabled={!channelUrl}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <MessageSquare size={12} />
            Open channel
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 mb-3 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      {items.length === 0 && !loading && (
        <p className="text-sm text-slate-500 py-6 text-center">
          {source === 'pending'
            ? 'No pending alerts. Run Apify or wait for the next scheduled scrape.'
            : 'No listings to show.'}
        </p>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.ref + (item.alertEventId ?? '')}
            className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 lg:grid-cols-[180px_1fr_auto]"
          >
            {/* Image preview */}
            <div className="relative aspect-[1200/630] overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.ogUrl} alt={item.project} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            </div>

            {/* Caption preview */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <div className="font-semibold text-sm truncate">
                  {item.project}
                  <span className="ml-2 text-xs font-normal text-slate-500">{item.community}</span>
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  AED {aedShort(item.currentPrice)} · {item.dropPct.toFixed(1)}%
                </div>
              </div>
              <pre className="max-h-32 overflow-auto rounded bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-700 whitespace-pre-wrap font-mono dark:bg-slate-800 dark:text-slate-300">
                {item.caption}
              </pre>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => copyText(item)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 min-w-[120px]"
              >
                {copiedRef === item.ref ? (
                  <>
                    <CheckCircle2 size={12} className="text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    Copy caption
                  </>
                )}
              </button>
              <button
                onClick={() => downloadHero(item)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <ImageIcon size={12} />
                Download hero
              </button>
              <a
                href={item.ogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ExternalLink size={12} />
                View hero
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
