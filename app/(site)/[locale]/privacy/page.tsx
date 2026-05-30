import { getTranslations, setRequestLocale } from 'next-intl/server';

export const metadata = {
  title: 'Privacy Policy · Below OP',
  description: 'How Below OP collects, uses, and protects personal data under UAE PDPL.',
};

export default async function PrivacyPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  // Legal pages are English-only for v1 (the EN text is the governing version).
  // We still surface a short notice in the reader's own locale so an Arabic
  // visitor understands why the body that follows is in English.
  setRequestLocale(locale);
  const tl = await getTranslations('legal');
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-xs text-slate-500">Last updated: 2026-05-22</p>

      <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
        {tl('governingNotice')}
      </p>

      <Section title="Who we are">
        <p>
          Below OP (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a Dubai-based property brokerage marketing platform.
          This policy explains what personal data we collect when you use this site, why we collect it,
          how long we keep it, and the rights you have over it under the UAE Personal Data Protection
          Law (Federal Decree-Law No. 45 of 2021, &ldquo;PDPL&rdquo;).
        </p>
      </Section>

      <Section title="What we collect">
        <p>When you submit an inquiry through this site we collect:</p>
        <ul className="list-disc ps-5 space-y-1">
          <li><strong>Name</strong> — to address you in our reply.</li>
          <li><strong>WhatsApp number</strong> — to route the inquiry to a licensed broker who will contact you back.</li>
          <li><strong>Optional message</strong> — any additional context you choose to share.</li>
          <li>
            <strong>Listing reference</strong> — the opaque ID of the unit you inquired about (e.g. <span className="font-mono">u-abc123</span>),
            so we can match the inquiry to inventory.
          </li>
          <li>
            <strong>IP hash</strong> — a one-way SHA-256 fingerprint of your IP address, truncated to 16 characters.
            We do not store your raw IP. The hash is used only to detect abuse (rate-limiting inquiries to a sensible cap).
          </li>
          <li>
            <strong>Consent timestamp</strong> — the moment you ticked the consent checkbox, plus the consent flag itself,
            so we can demonstrate lawful basis if asked.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect emirate ID numbers, passport details, financial information, biometric data,
          or special-category personal data through this site.
        </p>
      </Section>

      <Section title="Why we collect it (lawful basis)">
        <p>
          Lawful basis under PDPL Article 4: your explicit consent. The consent checkbox on the inquiry form is
          unbundled, opt-in (unchecked by default), and clearly explains the routing purpose. You can withdraw
          consent at any time (see &ldquo;Your rights&rdquo;).
        </p>
        <p>
          Purpose of processing: to route your inquiry to a licensed RERA-registered broker who can advise you on
          the listing. We do not sell, rent, or share your data with third-party marketers.
        </p>
      </Section>

      <Section title="How long we keep it (retention)">
        <p>
          We retain inquiry records until the lead is resolved (sold, withdrawn, or marked closed) plus 12 months
          for audit and dispute purposes. After that, the record is deleted. If you ask for earlier deletion we
          will honour the request unless we have a legal obligation to retain it.
        </p>
        <p>
          The IP hash is overwritten on the same retention schedule. Server logs that may transiently include IP
          addresses are rotated within 30 days.
        </p>
      </Section>

      <Section title="Who sees it">
        <p>
          Your inquiry is delivered to the on-call broker via Telegram (end-to-end encrypted). The underlying
          record is stored in our database (Neon Postgres, hosted in the EU region). The following sub-processors
          handle data on our behalf, under written contract:
        </p>
        <ul className="list-disc ps-5 space-y-1">
          <li>Vercel — hosting and serverless functions.</li>
          <li>Neon — managed Postgres database (EU region).</li>
          <li>Telegram — broker notification delivery channel.</li>
        </ul>
        <p className="text-xs text-slate-500">
          A WhatsApp Business notification channel (via Meta Cloud API direct) is planned. This policy will be
          updated to name Meta as an additional sub-processor before that channel is activated.
        </p>
      </Section>

      <Section title="Cookies">
        <p>This site uses two cookies, neither of which tracks you across other sites:</p>
        <ul className="list-disc ps-5 space-y-1">
          <li>
            <code className="font-mono">belowop_admin</code> — an HttpOnly, Secure, SameSite=Lax session cookie used
            <strong> only</strong> on the admin dashboard. Never set on a normal visit.
          </li>
          <li>
            <code className="font-mono">belowop-theme</code> — a non-tracking preference cookie that remembers your light/dark choice.
            Stored locally only.
          </li>
        </ul>
        <p>We do not use third-party advertising, analytics, or behavioural-tracking cookies.</p>
      </Section>

      <Section title="Your rights">
        <p>Under PDPL Articles 13–19 you have the right to:</p>
        <ul className="list-disc ps-5 space-y-1">
          <li>Access the personal data we hold about you.</li>
          <li>Correct anything inaccurate.</li>
          <li>Request deletion (&ldquo;right to be forgotten&rdquo;).</li>
          <li>Withdraw consent at any time.</li>
          <li>Object to or restrict further processing.</li>
        </ul>
        <p>
          To exercise any of these rights, email <span className="font-mono">privacy@emergedigital.com</span> from
          the phone or address associated with the inquiry. We respond within 30 calendar days. There is no fee.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit (TLS 1.3) and at rest (AES-256 at the database layer). Access to the
          production database is restricted to authorised engineering staff under named credentials with audit
          logging. Webhook ingestion is signed with HMAC-SHA256 and verified in constant time.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Below OP is not directed at children. We do not knowingly collect data from anyone under 18. If you
          believe a child has submitted an inquiry, email <span className="font-mono">privacy@emergedigital.com</span>
          and we will delete the record.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We&apos;ll publish material changes here with a new &ldquo;Last updated&rdquo; date and, where appropriate,
          notify existing subscribers before the change takes effect.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Data protection enquiries: <span className="font-mono">privacy@emergedigital.com</span>.<br />
          General enquiries: <span className="font-mono">rami@emergedigital.com</span>.
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
