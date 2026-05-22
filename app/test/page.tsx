import Link from 'next/link';

export const metadata = {
  title: 'Test plan · Below OP',
  description: 'Client testing guide for the Below OP demo.',
};

export default function TestPlanPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 prose-belowop">
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <p className="text-xs uppercase tracking-widest text-brand font-semibold">Client test plan</p>
        <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight">Below OP — try it</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          For Jad ALCHEIKH · From Rami · <span className="font-mono">2026-05-21</span>
        </p>
      </header>

      <Section title="1 · What you're looking at">
        <p>
          A working Progressive Web App that surfaces below-OP Dubai inventory as a filterable table and pushes
          alerts to WhatsApp + Telegram when new units or price drops appear. Everything you see is the production
          codebase running on real infrastructure (Vercel + Neon Postgres + Vercel Blob + Apify scraper).
        </p>
        <ul>
          <li>Already live with <strong>5 real listings</strong> ingested via the production scraper, plus <strong>30 seeded demo listings</strong>.</li>
          <li>The <strong>alert template matches your existing broker post format exactly</strong> (per <span className="font-mono text-xs">Variables.pdf</span>).</li>
          <li>Round 1 feedback (columns, no unit numbers, sqm units) is all live.</li>
        </ul>
      </Section>

      <Section title="2 · 5-minute mobile test">
        <p>Open <CodeLink href="/">belowop-demo.vercel.app</CodeLink> on your phone.</p>
        <ol>
          <li><strong>Install as an app</strong> → Share → &quot;Add to Home Screen&quot;. Launches standalone.</li>
          <li><strong>Scroll the listings</strong> — cards on mobile, table on desktop. ~35 units.</li>
          <li><strong>Tap a row</strong> → in-place modal opens. URL updates to <code>?inquire=u-xxxxxx</code> (shareable).</li>
          <li><strong>Submit a test inquiry</strong> — writes to the live DB.</li>
          <li><strong>Open <CodeLink href="/alerts">/alerts</CodeLink></strong> — public alert subscribe form.</li>
        </ol>
      </Section>

      <Section title="3 · 15-minute desktop test">
        <table className="text-sm">
          <thead>
            <tr><th>#</th><th>What</th><th>Where</th><th>Check</th></tr>
          </thead>
          <tbody>
            <Row n="1" what="Browse listings" where={<CodeLink href="/">/</CodeLink>} check="Layout, columns, sort, filter combinations" />
            <Row n="2" what="Inspect a unit" where="Click any row" check="Fields shown, CTA wording, modal closes via Esc or backdrop" />
            <Row n="3" what="Try filters" where="Top of /" check="URL updates per change — links are shareable" />
            <Row n="4" what="Alerts opt-in" where={<CodeLink href="/alerts">/alerts</CodeLink>} check="Channel selection, area chips, double opt-in flow" />
            <Row n="5" what="Alert message preview" where={<CodeLink href="/alert-preview">/alert-preview</CodeLink>} check="Exact WhatsApp + Telegram payload that fires" />
            <Row n="6" what="About page" where={<CodeLink href="/about">/about</CodeLink>} check="RERA disclosure placeholder, contact lines" />
            <Row n="7" what="404 page" where={<code>/anything-bad</code>} check="Bounce-back CTAs" />
          </tbody>
        </table>

        <h3 className="text-base font-semibold mt-6 mb-2">Alert template — confirm it matches your existing post format</h3>
        <pre className="rounded-md bg-slate-900 text-slate-100 p-4 text-[12px] leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">
{`🔴 DISTRESS DEAL - Below OP 🔴

📍 Project Name, Area

• Unit Type
• Bathrooms
• Size (sqft) | Size (sqm)
• Feature 1 | Feature 2
• Feature 3

Handover: Q3 2028
Payment: 3-Year Post-Handover
Developer: EMAAR

Selling Price: 3.2M AED | $872K 🔥
📉 14% below OP (was 3.7M AED)

For serious inquiries contact:
Wa.me/971585276222
See all units → belowop-demo.vercel.app`}
        </pre>
      </Section>

      <Section title="4 · Specific feedback we need">
        <Sub title="Public listing page">
          <ul>
            <li><strong>Columns:</strong> Image · Project (+Developer/Listed) · Area · Beds · Size m² · Price · AED/m² · Δ vs OP · CTA. Add or remove anything?</li>
            <li><strong>Filters:</strong> Type · Beds · Area · Developer · Min drop · Max price · Sort. Missing: handover year? size range? furnished/unfurnished?</li>
            <li><strong>Mobile cards</strong> — content right, or different fields needed on small screens?</li>
          </ul>
        </Sub>
        <Sub title="Alert format">
          <ul>
            <li>Matches your <code>Variables.pdf</code> template. Anything else broker-standard to add — Plot size, BUA, View, Sub-location?</li>
            <li>Direct WA CTA + web link both shown. Keep both, drop one?</li>
          </ul>
        </Sub>
        <Sub title="Lead capture modal">
          <ul>
            <li>Fields: Name, WhatsApp, message, consent. Want to add budget? Timeline?</li>
            <li>&quot;Request details&quot; + &quot;We&apos;ll WhatsApp you back within the hour.&quot; — tone OK?</li>
          </ul>
        </Sub>
        <Sub title="Anything I haven&apos;t asked">
          <ul>
            <li>Things you&apos;d send to a buyer searching Dubai portals that this product doesn&apos;t yet cover?</li>
            <li>Buyer personas — investors? End-users? Both?</li>
            <li>RERA / compliance details to surface more prominently?</li>
          </ul>
        </Sub>
      </Section>

      <Section title="5 · What's real vs demo">
        <table className="text-sm">
          <tbody>
            <Status what="Live Apify scraper feeding real listing data" status="real" />
            <Status what="Vercel Postgres persisting listings + leads + alerts" status="real" />
            <Status what="Image rehosting to our CDN (Vercel Blob, WebP)" status="real" extra="20 images already transcoded" />
            <Status what="WhatsApp lead notifications via Twilio" status="pending" extra="Code wired. Twilio account + Meta template approval (24–48h) pending." />
            <Status what="Telegram broadcast channel" status="pending" extra="Code wired. Bot + channel need creation (5 min via @BotFather)." />
            <Status what="Public alert subscriptions" status="pending" extra="Form + DB + double opt-in fully wired. Same dependency as above." />
            <Status what="RERA broker disclosure" status="pending" extra="Placeholder — fill in once registration is confirmed." />
          </tbody>
        </table>
        <p>
          So: <strong>buyers can already see live below-OP units and submit inquiries</strong> that hit our database.
          The only piece in flight is the outbound delivery — Twilio/Telegram credentials, not engineering work.
        </p>
      </Section>

      <Section title="6 · Staged roadmap once you sign off">
        <table className="text-sm">
          <thead>
            <tr><th>Sprint</th><th>Ships</th></tr>
          </thead>
          <tbody>
            <Row2 a="1 — this week" b="Twilio sandbox + Telegram bot connected. Lead alerts route to Rami's phone in real time." />
            <Row2 a="2" b="Meta WhatsApp template approval. Live broadcast to subscribers." />
            <Row2 a="3" b="Apify scraper schedule (every 30 min, full portal coverage)." />
            <Row2 a="4" b="Public site SEO + marketing launch." />
            <Row2 a="5" b="Multi-portal expansion — Bayut + Dubizzle scrapers." />
            <Row2 a="6" b="Web push notifications, broker dashboard, premium subscriptions." />
          </tbody>
        </table>
      </Section>

      <Section title="7 · How to give feedback">
        <p>
          Easiest: WhatsApp Rami with comments while you test — screenshots welcome.
          You can also reply to this doc, or open <CodeLink href="/admin/preview">/admin/preview</CodeLink> to view any specific
          listing&apos;s alert and screenshot from there.
        </p>
      </Section>

      <p className="mt-12 text-xs text-slate-500 italic">
        Built against the BelowOP-Handoff spec — CLAUDE.md, PWA_PRD, SRS, Solution_Architecture, Screens.md, UI.md, Variables.pdf.
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight mb-3">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      {children}
    </div>
  );
}

function CodeLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-mono text-brand hover:underline dark:text-brand-dark">{children}</Link>
  );
}

function Row({ n, what, where, check }: { n: string; what: string; where: React.ReactNode; check: string }) {
  return (
    <tr className="border-t border-slate-200 dark:border-slate-800">
      <td className="py-2 align-top text-slate-500">{n}</td>
      <td className="py-2 align-top font-medium">{what}</td>
      <td className="py-2 align-top text-slate-600 dark:text-slate-400">{where}</td>
      <td className="py-2 align-top">{check}</td>
    </tr>
  );
}

function Row2({ a, b }: { a: string; b: string }) {
  return (
    <tr className="border-t border-slate-200 dark:border-slate-800">
      <td className="py-2 align-top font-medium min-w-[120px]">{a}</td>
      <td className="py-2 align-top">{b}</td>
    </tr>
  );
}

function Status({ what, status, extra }: { what: string; status: 'real' | 'pending'; extra?: string }) {
  return (
    <tr className="border-t border-slate-200 dark:border-slate-800">
      <td className="py-2 align-top">
        {status === 'real' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">✓ Real</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">⏳ Pending</span>
        )}
      </td>
      <td className="py-2 align-top">
        <div>{what}</div>
        {extra && <div className="text-xs text-slate-500 mt-0.5">{extra}</div>}
      </td>
    </tr>
  );
}
