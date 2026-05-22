export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">About Below OP</h1>

      <Section title="What this site does">
        <p>
          Below OP is a curated, filterable feed of Dubai property inventory listed below
          Original Price (OP). New listings and further price drops are pushed in real time
          to WhatsApp and Telegram subscribers. Tap a unit to inquire — we&apos;ll WhatsApp you back.
        </p>
      </Section>

      <Section title="Data freshness">
        <p>Listings refreshed every 30 minutes. Live unit count and last-refresh timestamp are shown on the listings page.</p>
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
