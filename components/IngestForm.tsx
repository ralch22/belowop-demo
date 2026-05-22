'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

const SAMPLE_TITLE = 'Below OP | 3 Year Post Handover | 1BR+Office';
const SAMPLE_DESC = `Coldwell Banker Swap Real Estate is pleased to present this modern 1-bedroom apartment with office in Viewz 2 by Danube, a premium residential development in Business Bay, Dubai.

Unit Details:
1 Bedroom + Office
2 Bathrooms
BUA: 873.16 sq.ft
Floor: High Floor
Status: Below Original Price | 3-Year Post-Handover
Balcony: Private

Marina View. Original Price: AED 1,850,000 — selling at AED 1,600,000. Anticipated Handover Q4 2027.`;

export default function IngestForm() {
  const [title, setTitle] = useState(SAMPLE_TITLE);
  const [description, setDescription] = useState(SAMPLE_DESC);
  const [currentPrice, setCurrentPrice] = useState('1600000');
  const [beds, setBeds] = useState('1');
  const [propertyType, setPropertyType] = useState('Apartment');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = window.sessionStorage.getItem('belowop_admin_token') ?? window.prompt('Admin token:');
      if (!token) return;
      window.sessionStorage.setItem('belowop_admin_token', token);
      const resp = await fetch('/api/admin/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description,
          currentPrice: Number(currentPrice) || 0,
          beds,
          propertyType,
        }),
      });
      setResult(await resp.json());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={12}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono leading-relaxed dark:border-slate-700 dark:bg-slate-800"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Current price (AED)">
            <input
              value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </Field>
          <Field label="Beds">
            <input
              value={beds}
              onChange={(e) => setBeds(e.target.value)}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </Field>
          <Field label="Property type">
            <input
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Run parser
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold mb-3">Parsed output</p>
        {result ? (
          <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-slate-50 p-3 rounded dark:bg-slate-800">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-slate-500">Submit the form to see what the parser extracts.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</span>
      {children}
    </label>
  );
}
