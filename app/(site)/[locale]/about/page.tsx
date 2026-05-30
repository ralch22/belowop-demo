import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function AboutPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('about');
  const reraReady = process.env.NEXT_PUBLIC_RERA_READY === 'true';

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>

      <Section title={t('whatTitle')}>
        <p>
          {t.rich('whatBody', {
            telegram: (chunks) => (
              <a className="underline" href="https://t.me/dubaipropertydeal" target="_blank" rel="noopener noreferrer">{chunks}</a>
            ),
          })}
        </p>
      </Section>

      <Section title={t('freshnessTitle')}>
        <p>{t('freshnessBody')}</p>
      </Section>

      <Section title={t('broadcastTitle')}>
        <p>
          {t.rich('broadcastBody', {
            telegram: (chunks) => (
              <a className="underline font-medium" href="https://t.me/dubaipropertydeal" target="_blank" rel="noopener noreferrer">{chunks}</a>
            ),
          })}
        </p>
        <p className="mt-2">
          <Link href="/alert-preview" className="text-sm underline text-brand hover:text-brand-hover">
            {t('previewLink')}
          </Link>
        </p>
      </Section>

      {reraReady && (
        <Section title={t('brokerTitle')}>
          <p>
            {t('reraLabel')} <span className="font-mono">{process.env.NEXT_PUBLIC_RERA_NUMBER}</span>
          </p>
          <p>
            {t('brokerageLabel')} <span className="font-mono">{process.env.NEXT_PUBLIC_BROKERAGE_NAME}</span>
          </p>
        </Section>
      )}

      <Section title={t('privacyTitle')}>
        <p>{t('privacyBody')}</p>
      </Section>

      <Section title={t('contactTitle')}>
        <p>
          {t('contactEmailLabel')} <a className="font-mono underline hover:text-brand" href="mailto:rami@emergedigital.com">rami@emergedigital.com</a>
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">{children}</div>
    </section>
  );
}
