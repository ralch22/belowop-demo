'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { allCommunities } from '@/lib/listings';
import clsx from 'clsx';

export default function AlertsPage() {
  const router = useRouter();
  const [whatsapp, setWhatsapp] = useState(true);
  const [telegram, setTelegram] = useState(false);
  const [email, setEmail] = useState(false);
  const [phone, setPhone] = useState('');
  const [tgUser, setTgUser] = useState('');
  const [emailAddr, setEmailAddr] = useState('');
  const [type, setType] = useState<'any' | 'off_plan' | 'ready'>('any');
  const [areas, setAreas] = useState<string[]>(['Dubai Marina']);
  const [beds, setBeds] = useState('any');
  const [maxPrice, setMaxPrice] = useState('5000000');
  const [drop, setDrop] = useState(5);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleArea(a: string) {
    setAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Pick the first selected channel (priority: WhatsApp > Telegram > email).
    const channel: 'whatsapp' | 'telegram' | 'email' | null = whatsapp
      ? 'whatsapp'
      : telegram
        ? 'telegram'
        : email
          ? 'email'
          : null;

    if (!channel) {
      setError('Please pick at least one channel.');
      return;
    }
    const contact = channel === 'whatsapp' ? phone.trim() : channel === 'telegram' ? tgUser.trim() : emailAddr.trim();
    if (!contact) {
      setError('Please fill in the contact details for your selected channel.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel,
          contact,
          consent,
          filters: {
            type,
            areas,
            beds,
            maxPrice: Number(maxPrice) || undefined,
            minDropPct: drop,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      router.push('/alerts/confirmed?channel=' + channel);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  // Public broadcast feeds — one-tap subscribe with no form. Populated from
  // NEXT_PUBLIC_* env vars so the URLs are baked at build time and can change
  // without code edits.
  const channels: { name: 'WhatsApp Channel' | 'Telegram Channel'; href: string; followers?: string; brand: string }[] = [
    process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL
      ? { name: 'WhatsApp Channel', href: process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL, brand: 'bg-[#25D366]' }
      : null,
    process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL
      ? { name: 'Telegram Channel', href: process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL, brand: 'bg-[#229ED9]' }
      : { name: 'Telegram Channel', href: 'https://t.me/dubaipropertydeal', brand: 'bg-[#229ED9]' },
  ].filter(Boolean) as { name: 'WhatsApp Channel' | 'Telegram Channel'; href: string; brand: string }[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">
        Get Below-OP alerts in your inbox.
      </h1>
      <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
        Free. Unsubscribe anytime. Max 5 alerts/day. Telegram channel is live; WhatsApp 1:1 coming soon.
      </p>

      {channels.length > 0 && (
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Quickest: follow our public channels
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Telegram auto-posts every new find. WhatsApp Channel is updated by hand shortly after. No sign-up, no form.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {channels.map((c) => (
              <a
                key={c.name}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex items-center justify-between rounded-md ${c.brand} px-4 py-3 text-white shadow-sm transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand`}
              >
                <span className="font-medium">{c.name}</span>
                <span aria-hidden className="text-lg leading-none transition group-hover:translate-x-0.5">→</span>
              </a>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            Want the alerts filtered to specific areas, bed counts, or drop %? Use the form below for a personalised feed.
          </p>
          <div className="mt-4">
            <Link
              href="/alert-preview"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:text-slate-200 dark:hover:border-brand-dark dark:hover:text-brand-dark"
            >
              Preview an alert <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      )}

      <form onSubmit={submit} className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
        <Section title="Where should we send alerts?">
          <div className="space-y-3">
            <Channel
              checked={whatsapp}
              onChange={setWhatsapp}
              label="WhatsApp"
            >
              <div className="flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">+971</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!whatsapp}
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  placeholder="50 123 4567"
                  className="block w-full rounded-r-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:bg-slate-800 dark:disabled:bg-slate-900"
                />
              </div>
            </Channel>
            <Channel checked={telegram} onChange={setTelegram} label="Telegram">
              <input
                value={tgUser}
                onChange={(e) => setTgUser(e.target.value)}
                disabled={!telegram}
                autoComplete="username"
                placeholder="@username"
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:bg-slate-800"
              />
            </Channel>
            <Channel checked={email} onChange={setEmail} label="Email">
              <input
                value={emailAddr}
                onChange={(e) => setEmailAddr(e.target.value)}
                disabled={!email}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand dark:border-slate-700 dark:bg-slate-800"
              />
            </Channel>
          </div>
        </Section>

        <Section title="What should we alert you about?">
          <div className="space-y-4">
            <Field label="Type">
              <div className="inline-flex rounded-md bg-slate-100 p-1 dark:bg-slate-800">
                {(['any', 'off_plan', 'ready'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={clsx(
                      'px-4 py-1.5 text-sm font-medium rounded',
                      type === t
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400',
                    )}
                  >
                    {t === 'any' ? 'Any' : t === 'off_plan' ? 'Off-plan' : 'Ready'}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Areas">
              <div className="flex flex-wrap gap-2">
                {allCommunities.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleArea(a)}
                    className={clsx(
                      'rounded-full px-3 py-1 text-xs font-medium transition',
                      areas.includes(a)
                        ? 'bg-brand text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
                    )}
                  >
                    {areas.includes(a) ? '✓ ' : '+ '}{a}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Beds">
                <select
                  value={beds}
                  onChange={(e) => setBeds(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="any">Any</option>
                  <option value="studio">Studio</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4+">4+</option>
                </select>
              </Field>
              <Field label="Max price (AED)">
                <select
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="2000000">2,000,000</option>
                  <option value="5000000">5,000,000</option>
                  <option value="10000000">10,000,000</option>
                  <option value="20000000">20,000,000</option>
                  <option value="0">No limit</option>
                </select>
              </Field>
            </div>

            <Field label={`Min drop %: ≥ ${drop}%`}>
              <input
                type="range"
                min={5}
                max={25}
                step={1}
                value={drop}
                onChange={(e) => setDrop(Number(e.target.value))}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mt-1"><span>5%</span><span>15%</span><span>25%</span></div>
            </Field>
          </div>
        </Section>

        <label className="mt-2 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span>I agree to the privacy notice and terms.</span>
        </label>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!consent || submitting || (!whatsapp && !telegram && !email)}
          className="mt-6 w-full rounded-md bg-brand py-3 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
        >
          {submitting ? 'Sending confirmation…' : 'Subscribe'}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 border-b border-slate-100 pb-6 last:border-0 last:pb-0 dark:border-slate-800">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</span>
      {children}
    </div>
  );
}

function Channel({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <label className="flex items-center gap-2 pt-2 min-w-[110px]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
        />
        <span className="text-sm font-medium">{label}</span>
      </label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
