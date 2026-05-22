import Link from 'next/link';

type Channel = 'whatsapp' | 'telegram' | 'email';

const COPY: Record<Channel, { heading: string; body: React.ReactNode; ctaLabel: string; ctaHref: string }> = {
  whatsapp: {
    heading: 'Confirm in your WhatsApp',
    body: (
      <>We just sent a message to your number. Reply <span className="font-mono font-semibold">YES</span> to start receiving alerts.</>
    ),
    ctaLabel: 'Open WhatsApp',
    ctaHref: 'https://wa.me/971500000000',
  },
  telegram: {
    heading: 'Confirm in Telegram',
    body: <>We just sent a confirmation link to your Telegram. Open it and tap to confirm.</>,
    ctaLabel: 'Open Telegram',
    ctaHref: 'https://t.me/',
  },
  email: {
    heading: 'Check your inbox',
    body: <>We just sent a confirmation email. Click the link inside to start receiving alerts.</>,
    ctaLabel: 'Back to listings',
    ctaHref: '/',
  },
};

export default function ConfirmedPage({ searchParams }: { searchParams: { channel?: string } }) {
  const channel: Channel = (['whatsapp', 'telegram', 'email'] as const).includes(
    searchParams.channel as Channel,
  )
    ? (searchParams.channel as Channel)
    : 'whatsapp';
  const copy = COPY[channel];

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <span className="text-3xl" aria-hidden>✅</span>
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{copy.heading}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{copy.body}</p>
      <Link
        href={copy.ctaHref}
        className="mt-6 inline-flex items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
      >
        {copy.ctaLabel}
      </Link>
      <p className="mt-6 text-xs text-slate-600 dark:text-slate-400">
        Didn&apos;t get it?{' '}
        <Link href="/alerts" className="font-medium text-brand hover:underline">Change details</Link>
      </p>
    </div>
  );
}
