export const metadata = {
  title: 'Terms of Use · Below OP',
  description: 'Terms governing your use of the Below OP property-marketing site.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Use</h1>
      <p className="mt-2 text-xs text-slate-500">Last updated: 2026-05-21</p>

      <Section title="1. About this site">
        <p>
          Below OP is a marketing site operated by a Dubai-based property brokerage. It surfaces
          below-Original-Price (&ldquo;below-OP&rdquo;) Dubai inventory and lets you submit an inquiry to be
          contacted by a licensed broker. By using the site you agree to these terms.
        </p>
      </Section>

      <Section title="2. Listings are broker inventory, not contracts">
        <p>
          Every listing shown here is offered by Below OP as the brokerage, on behalf of the seller of record.
          A listing is an invitation to inquire — it is <strong>not</strong> an offer to sell, a binding price,
          or a guarantee of availability. Prices, sizes, handover dates, payment-status descriptions, and any
          other attribute may change at any time without notice.
        </p>
      </Section>

      <Section title="3. No warranty of accuracy">
        <p>
          We aggregate listing data from multiple sources and refresh it every 30 minutes. Despite our best
          efforts, some fields may be stale, mis-categorised, or incomplete. Before signing anything you must
          independently verify all material facts — title, RERA registration of the unit, service charges,
          tenancy status, escrow status, encumbrances, and current price.
        </p>
        <p>
          We provide the site &ldquo;as is&rdquo; and disclaim all implied warranties (merchantability, fitness
          for a particular purpose, non-infringement) to the maximum extent permitted by UAE law.
        </p>
      </Section>

      <Section title="4. Broker disclosure (RERA)">
        <p>
          When our RERA broker registration is finalised, the registration number and operating brokerage name
          will be displayed in the site footer and on the <a className="underline" href="/about">About</a> page.
          Until that disclosure is live, this site is in pre-launch demo mode and no transactions should be
          concluded on the basis of information shown here.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Submit false or misleading information through the inquiry form.</li>
          <li>Submit another person&apos;s WhatsApp number without their consent.</li>
          <li>Scrape, mirror, or republish listings or alert messages without written permission.</li>
          <li>Attempt to probe, scan, or test the security of the site or its infrastructure.</li>
          <li>Use the site to send spam, harass our brokers, or interfere with normal operation.</li>
        </ul>
      </Section>

      <Section title="6. Inquiries and follow-up">
        <p>
          When you submit an inquiry, a licensed broker will WhatsApp you back, typically within one hour during
          UAE business hours. Submitting an inquiry does not commit you to anything and you can ask the broker
          to stop contacting you at any time.
        </p>
        <p>
          We rate-limit inquiry submissions to a small number per phone number per day to discourage abuse.
          Legitimate buyers will not normally hit this limit.
        </p>
      </Section>

      <Section title="7. Intellectual property">
        <p>
          The site design, copy, logo, and alert templates are owned by Below OP. Listing photos remain the
          property of their original photographers or the brokerage that supplied them. You may share a link to
          a listing freely; you may not republish the underlying images or data feeds.
        </p>
      </Section>

      <Section title="8. Liability">
        <p>
          To the maximum extent permitted by UAE law, Below OP is not liable for any indirect, incidental, or
          consequential loss arising from your use of the site, including loss of profit, missed opportunity,
          or decisions made on the basis of stale or inaccurate listing information.
        </p>
      </Section>

      <Section title="9. Privacy">
        <p>
          Use of the inquiry form is governed by our <a className="underline" href="/privacy">Privacy Policy</a>,
          which explains what we collect and your PDPL rights.
        </p>
      </Section>

      <Section title="10. Governing law and disputes">
        <p>
          These terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai.
          Any dispute arising from these terms or your use of the site is subject to the exclusive jurisdiction
          of the Dubai courts.
        </p>
      </Section>

      <Section title="11. Changes">
        <p>
          We may update these terms from time to time. The &ldquo;Last updated&rdquo; date at the top of this
          page reflects the most recent revision. Continued use of the site after a change constitutes
          acceptance of the new terms.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions about these terms: <span className="font-mono">hello@belowop.ae</span>.
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
