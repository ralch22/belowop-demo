import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

type Channel = 'whatsapp' | 'telegram' | 'email';

export default async function ConfirmedPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { channel?: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('alertsConfirmed');

  const channel: Channel = (['whatsapp', 'telegram', 'email'] as const).includes(
    searchParams.channel as Channel,
  )
    ? (searchParams.channel as Channel)
    : 'whatsapp';

  const copy =
    channel === 'whatsapp'
      ? {
          heading: t('whatsappHeading'),
          body: t.rich('whatsappBody', {
            yes: (chunks) => <span className="font-mono font-semibold">{chunks}</span>,
          }),
          ctaLabel: t('whatsappCta'),
          ctaHref: 'https://wa.me/971585276222',
          external: true,
        }
      : channel === 'telegram'
        ? {
            heading: t('telegramHeading'),
            body: t('telegramBody'),
            ctaLabel: t('telegramCta'),
            ctaHref: 'https://t.me/',
            external: true,
          }
        : {
            heading: t('emailHeading'),
            body: t('emailBody'),
            ctaLabel: t('emailCta'),
            ctaHref: '/',
            external: false,
          };

  const ctaClass =
    'mt-6 inline-flex items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand';

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <span className="text-3xl" aria-hidden>✅</span>
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{copy.heading}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{copy.body}</p>
      {copy.external ? (
        <a href={copy.ctaHref} target="_blank" rel="noopener noreferrer" className={ctaClass}>
          {copy.ctaLabel}
        </a>
      ) : (
        <Link href={copy.ctaHref} className={ctaClass}>
          {copy.ctaLabel}
        </Link>
      )}
      <p className="mt-6 text-xs text-slate-600 dark:text-slate-400">
        {t('didntGet')}{' '}
        <Link href="/alerts" className="font-medium text-brand hover:underline">{t('changeDetails')}</Link>
      </p>
    </div>
  );
}
