export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">About Below OP</h1>

      <Section title="What this site does">
        <p>
          Below OP is a curated, filterable feed of Dubai property inventory listed below
          Original Price (OP). New finds are broadcast to our public Telegram channel
          <a className="underline" href="https://t.me/dubaipropertydeal" target="_blank" rel="noopener noreferrer"> @DubaiPropertydeal</a>;
          a WhatsApp Business 1:1 channel is in the queue. Tap a unit to inquire and our broker will follow up.
        </p>
      </Section>

      <Section title="Data freshness">
        <p>
          Listings are ingested from leading Dubai listing portals via a scheduled scraper. Live unit count and
          last-update timestamp are shown on the listings page. Today the table reflects the most recent
          ingestion run.
        </p>
      </Section>

      <Section title="Public broadcast">
        <p>
          The fastest way to see every new below-OP find:
          {' '}<a className="underline font-medium" href="https://t.me/dubaipropertydeal" target="_blank" rel="noopener noreferrer">Telegram → @DubaiPropertydeal</a>.
          The same finds also post to our WhatsApp Channel manually shortly after.
        </p>
      </Section>

      <Section title="Broker disclosure">
        <p>
          RERA broker registration: <span className="font-mono text-slate-500">{'<pending §7.1 — launch-blocker>'}</span>
        </p>
        <p>
          Operating brokerage: <span className="font-mono text-slate-500">{'<TBD>'}</span>
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Public launch is gated on RERA registration being completed and disclosed here.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          We collect only what you submit (name, WhatsApp number, optional message). Leads
          are stored to fulfil your inquiry and routed to a licensed broker. You can request
          deletion at any time per UAE PDPL.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          WhatsApp: <span className="font-mono">+971 50 000 0000</span><br />
          Email: <span className="font-mono">hello@belowop.ae</span>
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
