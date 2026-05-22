'use client';

import { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';

interface Job {
  key: string;
  label: string;
  description: string;
}

const JOBS: Job[] = [
  { key: 'image-sync', label: 'Run image-sync', description: 'Rehost source images → Blob WebP' },
  { key: 'alerts-dispatch', label: 'Run alerts dispatch', description: 'Process queued alert_events' },
];

export default function AdminRunButtons() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; result: unknown; at: string }>>({});

  async function run(job: string) {
    setRunning(job);
    try {
      // The browser sends our admin session cookie. Server reads ADMIN_TOKEN
      // and forwards to the cron route with CRON_SECRET — but we don't have
      // the admin token in the cookie value to forward directly. So we POST
      // through the cookie-gated endpoint instead, which the next iteration
      // will support. For now, prompt for token.
      const token = window.sessionStorage.getItem('belowop_admin_token') ?? window.prompt('Admin token:');
      if (!token) return;
      window.sessionStorage.setItem('belowop_admin_token', token);
      const resp = await fetch(`/api/admin/run?job=${job}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await resp.json();
      setResults((r) => ({ ...r, [job]: { ok: resp.ok && result.ok, result, at: new Date().toISOString() } }));
    } catch (e) {
      setResults((r) => ({ ...r, [job]: { ok: false, result: { error: (e as Error).message }, at: new Date().toISOString() } }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Run jobs now</p>
      <p className="text-xs text-slate-500 mb-3">
        Hobby tier crons are daily. Use these to fire on demand. Prompts for admin token on first click; cached for the tab session.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {JOBS.map((j) => {
          const result = results[j.key];
          const isRunning = running === j.key;
          return (
            <div key={j.key} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{j.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{j.description}</p>
                </div>
                <button
                  onClick={() => run(j.key)}
                  disabled={isRunning}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
                  aria-label={`Run ${j.key}`}
                >
                  {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                </button>
              </div>
              {result && (
                <pre
                  className={`mt-2 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-[10px] font-mono ${
                    result.ok ? 'text-slate-700' : 'text-red-700'
                  } dark:bg-slate-800 dark:text-slate-300`}
                >
                  {JSON.stringify(result.result, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
