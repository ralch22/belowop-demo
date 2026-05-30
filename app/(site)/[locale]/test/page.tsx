import { Link } from '@/i18n/navigation';

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
          For Jad ALCHEIKH · From Rami · <span className="font-mono">2026-05-22</span>
        </p>
      </header>

      <Section title="1 · What you're looking at">
        <p>
          A working Progressive Web App that surfaces below-OP Dubai inventory as a filterable table and auto-broadcasts
          new finds to a Telegram channel — with a one-click relay flow into the WhatsApp Channel and a direct DM to Rami
          the second a buyer submits an inquiry.
        </p>
        <p>
          Everything is production: Vercel (Next.js 14 + cron) · Neon Postgres · Vercel Blob · Vercel KV · Apify
          (<code>azzouzana/propertyfinder-ads-search-results-pages-scraper</code>) · Telegram Bot API.
        </p>
        <p className="font-semibold mt-2">What changed since the last review:</p>
        <ul>
          <li><strong>102 real PropertyFinder listings live.</strong> No more seed/mock data.</li>
          <li><strong>Telegram is broadcasting.</strong> Channel <code>@DubaiPropertydeal</code> auto-posts every below-OP find from the most recent Apify ingestion. Bot <code>@DubaiPropertyDealsbot</code> DMs Rami on every lead.</li>
          <li><strong>Alert template matches your <code>Variables.pdf</code> exactly.</strong></li>
          <li><strong>WhatsApp Channel relay built</strong> at <CodeLink href="/admin/relay">/admin/relay</CodeLink> — 3 clicks per post (Meta has no Channel API).</li>
          <li><strong>PWA shipped:</strong> service worker, install prompt, offline fallback, full icon set.</li>
          <li><strong>Privacy + Terms pages live</strong>, PDPL-aligned.</li>
          <li><strong>84 automated tests + CI guardrail.</strong></li>
        </ul>
      </Section>

      <Section title="2 · 5-minute mobile test">
        <p>Open <CodeLink href="/">belowop-demo.vercel.app</CodeLink> on your phone.</p>
        <ol>
          <li><strong>Install as an app</strong> — Share → &quot;Add to Home Screen&quot; (or tap the install banner).</li>
          <li><strong>Scroll the listings</strong> — 102 real PropertyFinder units. Cards on mobile, table on desktop.</li>
          <li><strong>Tap a row</strong> → in-place modal opens. URL updates to <code>?inquire=u-xxxxxx</code> (shareable).</li>
          <li><strong>Submit a test inquiry</strong> — within ~1s Rami&apos;s Telegram bot receives the lead.</li>
          <li><strong>Open <CodeLink href="/alerts">/alerts</CodeLink></strong> — channel selection, area chips, double opt-in.</li>
          <li><strong>Tap the Telegram channel button</strong> → opens <code>t.me/dubaipropertydeal</code> — auto-broadcast feed.</li>
        </ol>
      </Section>

      <Section title="3 · 15-minute desktop test">
        <table className="text-sm">
          <thead>
            <tr><th>#</th><th>What</th><th>Where</th><th>Check</th></tr>
          </thead>
          <tbody>
            <Row n="1" what="Browse listings" where={<CodeLink href="/">/</CodeLink>} check="Layout, 25/page, sort, filter combinations" />
            <Row n="2" what="Inspect a unit" where="Click any row" check="Fields shown, CTA wording, Esc / backdrop closes modal" />
            <Row n="3" what="Try filters" where="Top of /" check="URL updates per change — links are shareable" />
            <Row n="4" what="Alerts opt-in" where={<CodeLink href="/alerts">/alerts</CodeLink>} check="Channel selection, area chips, double opt-in flow" />
            <Row n="5" what="Alert preview" where={<CodeLink href="/alert-preview">/alert-preview</CodeLink>} check="Exact Telegram + WhatsApp payload" />
            <Row n="6" what="Live Telegram feed" where={<code>t.me/dubaipropertydeal</code>} check="Auto-posted hero + canonical caption per below-OP find" />
            <Row n="7" what="About page" where={<CodeLink href="/about">/about</CodeLink>} check="RERA disclosure placeholder, contact lines" />
            <Row n="8" what="Privacy + Terms" where={<><CodeLink href="/privacy">/privacy</CodeLink>, <CodeLink href="/terms">/terms</CodeLink></>} check="PDPL-aligned wording" />
            <Row n="9" what="Offline fallback" where="DevTools → Offline → reload" check="Cached shell + offline page renders" />
            <Row n="10" what="404 page" where={<code>/anything-bad</code>} check="Bounce-back CTAs" />
            <Row n="11" what="Admin dashboard" where={<CodeLink href="/admin">/admin</CodeLink>} check="Counts: listings / leads / subs / dispatch queue" />
            <Row n="12" what="Alert preview tool" where={<CodeLink href="/admin/preview">/admin/preview</CodeLink>} check="Pick any listing → see exact send payload" />
            <Row n="13" what="Manual ingest tester" where={<CodeLink href="/admin/ingest">/admin/ingest</CodeLink>} check="Paste Apify payload → see parser output" />
            <Row n="14" what="WhatsApp Channel relay" where={<CodeLink href="/admin/relay">/admin/relay</CodeLink>} check="Pending dispatches → Copy / Download / Open Channel" />
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
            <li>Telegram + WhatsApp Channel get the same caption today — should they differ?</li>
          </ul>
        </Sub>
        <Sub title="Lead capture modal">
          <ul>
            <li>Fields: Name, WhatsApp, message, consent. Want to add budget? Timeline?</li>
            <li>&quot;Request details&quot; + &quot;We&apos;ll WhatsApp you back within the hour.&quot; — tone OK?</li>
          </ul>
        </Sub>
        <Sub title="WhatsApp Channel workflow">
          <ul>
            <li>Today <CodeLink href="/admin/relay">/admin/relay</CodeLink> posts each find in 3 clicks (copy · download · open). Acceptable, or do you want Twilio 1:1 fallback fully automated?</li>
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

      <Section title="5 · What's real vs pending">
        <table className="text-sm">
          <tbody>
            <Status what="Apify scraper (azzouzana) ingestion path wired + HMAC-verified" status="partial" extra="102 listings ingested by one Apify run; recurring schedule pending Rami (docs/APIFY-SCHEDULE-SETUP.md)" />
            <Status what="Neon Postgres persisting listings + leads + alerts + subscribers" status="real" />
            <Status what="Image rehosting to our CDN (Vercel Blob, WebP)" status="real" extra="~300 images transcoded" />
            <Status what="OP extraction from broker description" status="real" extra="Regex parser + 5% baseline fallback" />
            <Status what="Telegram channel @DubaiPropertydeal auto-broadcast" status="real" extra="Cron-driven, hero + canonical caption" />
            <Status what="Telegram bot @DubaiPropertyDealsbot DMs Rami on every lead" status="real" extra="Verified end-to-end" />
            <Status what="Public alert subscriptions + double opt-in" status="real" extra="Telegram delivery live" />
            <Status what="PWA service worker, install prompt, offline page" status="real" />
            <Status what="Admin tools: /admin, /admin/preview, /admin/ingest, /admin/relay" status="real" />
            <Status what="Privacy + Terms pages (PDPL-aligned)" status="real" />
            <Status what="Automated tests + CI" status="real" extra="84 tests · GitHub Actions on every push" />
            <Status what="WhatsApp Channel @DubaiPropertydeal broadcast" status="partial" extra="Manual via /admin/relay — Meta has no Channel API, so we built the 3-click relay" />
            <Status what="WhatsApp 1:1 via Meta Cloud API direct (Jad's WABA already approved)" status="pending" extra="Deferred per client direction — table is current priority. Plan at docs/WhatsApp-Integration-Plan.md. Twilio path retired." />
            <Status what="RERA broker disclosure" status="pending" extra="Placeholder — fill in once registration is confirmed" />
          </tbody>
        </table>
        <p>
          So: <strong>102 live listings, Telegram channel broadcasting, Rami pinged on every lead, WhatsApp Channel fed in 3 clicks.</strong>
          {' '}The only outbound piece still external is Twilio 1:1 — a Jad-side setup task, not engineering.
        </p>
      </Section>

      <Section title="6 · Staged roadmap once you sign off">
        <table className="text-sm">
          <thead>
            <tr><th>Sprint</th><th>Ships</th></tr>
          </thead>
          <tbody>
            <Row2 a="1 — this week" b="Apify recurring schedule wired (docs/APIFY-SCHEDULE-SETUP.md). Pipeline hardening: ingestion log, stale pruning (2-miss), /admin/pipeline page, watchdog cron." />
            <Row2 a="2" b="HMAC body signing on Apify webhook. Signed expiring unsubscribe tokens. Postgres RLS. CSP + security headers." />
            <Row2 a="3" b="WhatsApp 1:1 via Meta Cloud API direct — single below_op_alert template + 24h-window free-form (docs/WhatsApp-Integration-Plan.md)." />
            <Row2 a="4" b="Public site SEO. Email channel via Resend." />
            <Row2 a="5" b="Multi-portal expansion — Bayut + Dubizzle scrapers." />
            <Row2 a="6" b="Web push notifications, broker dashboard, premium subscriptions." />
          </tbody>
        </table>
        <p className="mt-3 text-sm">
          Full engineering scope with priorities (High / Medium / Low) and effort estimates is in
          {' '}<code>docs/BelowOP-Scope-For-Approval.docx</code>.
        </p>
      </Section>

      <Section title="7 · How to give feedback">
        <p>
          Easiest: WhatsApp Rami with comments while you test — screenshots welcome.
        </p>
        <p>
          Source &amp; docs are public on GitHub: <a href="https://github.com/ralch22/belowop-demo" className="font-mono text-brand hover:underline dark:text-brand-dark">github.com/ralch22/belowop-demo</a>
        </p>
        <ul>
          <li><code>docs/APIFY-SCHEDULE-SETUP.md</code> — Rami&apos;s top-priority setup task</li>
          <li><code>docs/WhatsApp-Integration-Plan.md</code> — Meta Cloud API direct (current plan; deferred)</li>
          <li><code>docs/GHL-vs-Twilio.md</code> — vendor comparison (superseded)</li>
          <li><code>docs/BelowOP-Scope-For-Approval.docx</code> — remaining work + priorities</li>
          <li><code>docs/RTM_COVERAGE.md</code> — 105 requirements mapped to current build state</li>
          <li><code>docs/LAUNCH_CHECKLIST.md</code> — spec §8 acceptance criteria</li>
          <li><code>docs/BelowOP-Twilio-Setup.pdf</code> — archived (Twilio path retired)</li>
        </ul>
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

function Status({ what, status, extra }: { what: string; status: 'real' | 'partial' | 'pending'; extra?: string }) {
  const badge =
    status === 'real' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">✓ Real</span>
    ) : status === 'partial' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">◐ Manual</span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">⏳ Pending</span>
    );
  return (
    <tr className="border-t border-slate-200 dark:border-slate-800">
      <td className="py-2 align-top">{badge}</td>
      <td className="py-2 align-top">
        <div>{what}</div>
        {extra && <div className="text-xs text-slate-500 mt-0.5">{extra}</div>}
      </td>
    </tr>
  );
}
