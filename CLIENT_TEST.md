# Below OP — Client Test Plan

**For:** Jad ALCHEIKH
**From:** Rami · Emerge Digital
**Demo:** https://belowop-demo.vercel.app
**Source:** https://github.com/ralch22/belowop-demo
**Updated:** 2026-05-22

---

## 1 · What you're looking at

A working Progressive Web App that surfaces below-OP Dubai inventory as a filterable table and auto-broadcasts new finds to a Telegram channel — with a one-click relay flow into your WhatsApp Channel and a direct DM to Rami the second a buyer submits an inquiry.

Everything you see is the production codebase running on real infrastructure: **Vercel** (Next.js 14 + cron) · **Neon Postgres** (listings, leads, alerts, subscribers) · **Vercel Blob** (CDN-hosted hero images) · **Vercel KV** (rate-limiting + dedup) · **Apify** (`azzouzana/propertyfinder-ads-search-results-pages-scraper`) · **Telegram Bot API**.

**What changed since the last review:**

- **102 real PropertyFinder listings live.** No more seed/mock data — the demo content has been removed.
- **Telegram is live and broadcasting.** Channel **@DubaiPropertydeal** (`t.me/dubaipropertydeal`) auto-posts every new below-OP unit with hero image + canonical broker caption. Bot **@DubaiPropertyDealsbot** DMs Rami the moment a lead is captured.
- **Alert template matches your `Variables.pdf` broker post format exactly.** Same emoji header, same line order, same tone.
- **WhatsApp Channel relay built.** Because Meta has no public Channel API, we built a 3-click admin workflow (copy caption → download hero → open Channel) — see `/admin/relay`.
- **PWA shipped.** Service worker, install prompt, offline fallback, all 6 icon sizes.
- **Privacy + Terms pages live**, PDPL-aligned.
- **84 automated tests passing + CI guardrail on every push.**

Round 2 of feedback from you drives the next sprint.

---

## 2 · 5-minute test on your phone

Open **https://belowop-demo.vercel.app** on iPhone or Android.

1. **Install as an app** — Share → "Add to Home Screen" (or the install banner that auto-appears). App launches standalone, looks native.
2. **Scroll the listing table** — 102 real PropertyFinder units. Cards on mobile, table on desktop. Hero images served from our own CDN, not PropertyFinder.
3. **Tap a row** — opens an in-place modal asking for name + WhatsApp. The URL updates to `?inquire=u-xxxxxx` so it's shareable.
4. **Submit a test inquiry** — your name + a UAE number + tick consent. Within ~1 second Rami's Telegram receives the lead notification.
5. **Open `/alerts`** — choose channels, areas, price range, min drop %. This is the public subscribe form for buyers.
6. **Join the Telegram channel** — tap the channel button on `/alerts` → opens `t.me/dubaipropertydeal`. You'll see the auto-broadcast feed.

---

## 3 · 15-minute full test on desktop

| # | What | Where | What to check |
|---|---|---|---|
| 1 | Browse listings | `/` | Table layout, 25/page, sort by AED/m², filter by developer/area/drop% |
| 2 | Inspect one unit | Click any row → modal | Fields shown (unit type, bathrooms, handover, features), CTA wording |
| 3 | Try filters | Top of `/` | Area, developer, beds, max price, min drop %. URL updates on each change — links are shareable. |
| 4 | Alerts opt-in | `/alerts` | Channel selection, area chips, double opt-in flow, Telegram + WhatsApp Channel CTAs |
| 5 | Alert message preview | `/alert-preview` | The exact Telegram + WhatsApp message that fires |
| 6 | Live Telegram feed | `t.me/dubaipropertydeal` | Channel posts (image + canonical caption) for every recent below-OP find |
| 7 | About page | `/about` | Broker disclosure section (RERA placeholder), contact lines |
| 8 | Privacy + Terms | `/privacy`, `/terms` | PDPL-aligned wording, broker disclosures |
| 9 | Offline fallback | DevTools → Network → Offline → reload `/` | Cached shell + offline page |
| 10 | 404 page | `/anything-bad` | Custom 404 with bounce-back CTAs |
| 11 | Admin dashboard | `/admin` | Counts (listings / leads / subs / dispatch queue) |
| 12 | Alert preview tool | `/admin/preview` | Pick any listing → see exactly what gets sent |
| 13 | Manual ingest tester | `/admin/ingest` | Paste an Apify payload → see parser output |
| 14 | WhatsApp Channel relay | `/admin/relay` | Pending dispatches → Copy caption / Download hero / Open Channel buttons |

**For the alert template specifically** — open `/alert-preview` and confirm it matches what you send today. The layout follows your `Variables.pdf`:

```
🔴 DISTRESS DEAL - Below OP 🔴

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
See all units → belowop-demo.vercel.app
```

---

## 4 · Specific feedback we need from you

Please react to each — short answers are fine:

### Public listing page

- **Columns:** Image · Project (+ Developer · Listed) · Area · Beds · Size m² · Price · AED/m² · Δ vs OP · CTA. Anything to add/remove?
- **Filters:** Type · Beds · Area · Developer · Min drop % · Max price · Sort. What's missing — handover year? size range? furnishing?
- **Mobile cards** — content right? Or do you want different fields shown on a smaller card?

### Alert format

- Matches your `Variables.pdf` template — anything else broker-standard we should add (Plot size? BUA? View? Sub-location)?
- Direct WhatsApp CTA + web link both shown. Do you want the web link removed, or kept?
- Telegram + WhatsApp Channel get the same caption today — should we tune them differently per channel?

### Lead capture modal

- Fields: Name, WhatsApp, message, consent. Want to add anything (budget? timeline?)?
- Tone of "Request details" + "We'll WhatsApp you back within the hour." OK?

### WhatsApp Channel workflow

- Today, `/admin/relay` lets you/an assistant post each new find into the Channel in 3 clicks (copy caption · download hero · open Channel). Acceptable for now, or do you want this fully automated via **Meta Cloud API direct** (see [`docs/WhatsApp-Integration-Plan.md`](docs/WhatsApp-Integration-Plan.md))?

### Anything I haven't asked

- Things you'd send to PropertyFinder + Bayut + Dubizzle searchers that this product doesn't yet cover?
- Buyer personas — does the experience speak to investors? End-users? Both?
- Are there any RERA / compliance details you want surfaced more prominently?

---

## 5 · What's real vs what's pending

| | Status |
|---|---|
| Apify scraper (`azzouzana`) ingestion path wired + HMAC-verified | 🟡 Manual — 102 listings ingested by one Apify run; recurring schedule pending Rami ([docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md)) |
| Neon Postgres persisting listings + leads + alerts + subscribers | ✅ Real |
| Image rehosting to our own CDN (Vercel Blob, WebP) | ✅ Real — ~300 images transcoded |
| OP value extraction from broker description | ✅ Real — regex parser + 5% baseline fallback |
| Telegram channel `@DubaiPropertydeal` auto-broadcast | ✅ Real — cron-driven, images + canonical caption |
| Telegram bot `@DubaiPropertyDealsbot` DM to Rami on every lead | ✅ Real — verified end-to-end |
| Public alert subscriptions + double opt-in | ✅ Real — Telegram delivery live |
| PWA service worker, install prompt, offline page | ✅ Real |
| Admin tools: `/admin`, `/admin/preview`, `/admin/ingest`, `/admin/relay` | ✅ Real |
| Privacy + Terms pages (PDPL-aligned) | ✅ Real |
| Automated tests + CI | ✅ Real — 84 tests, GitHub Actions on every push |
| WhatsApp Channel `@DubaiPropertydeal` broadcast | 🟡 Manual via `/admin/relay` — Meta has no Channel API, so we built the 3-click relay |
| WhatsApp 1:1 delivery via Meta Cloud API direct (Jad's WABA already approved) | ⏳ Deferred per client direction — table is current priority; see [docs/WhatsApp-Integration-Plan.md](docs/WhatsApp-Integration-Plan.md). Twilio path retired (`docs/BelowOP-Twilio-Setup.pdf` archived). |
| RERA broker disclosure | ⏳ Placeholder — fill in once registration is confirmed |

So: **buyers see 102 live PropertyFinder below-OP units, the Telegram channel is broadcasting, Rami gets pinged on every lead in real time via Telegram bot, and the WhatsApp Channel is fed in 3 clicks from `/admin/relay`.** The remaining work is twofold: (1) Rami wiring the Apify schedule so the table refreshes automatically (top priority — see [docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md)), and (2) Meta Cloud API direct integration for automated 1:1 WhatsApp DMs (deferred — Jad's WABA is ready when we resume).

---

## 6 · Staged roadmap once you sign off

Priority reflects the 2026-05-22 direction: **table first; alerts can be manual for now.**

| Sprint | What ships |
|---|---|
| 1 — this week | Apify recurring schedule wired ([docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md)). Pipeline hardening: `ingestion_runs` log table, stale-listing pruning (2-miss conservative), `/admin/pipeline` observability page, watchdog cron with Telegram alert. |
| 2 | HMAC body signing on Apify webhook. Signed expiring unsubscribe tokens. Postgres RLS policies. CSP + security headers. |
| 3 | WhatsApp 1:1 via Meta Cloud API direct ([docs/WhatsApp-Integration-Plan.md](docs/WhatsApp-Integration-Plan.md)) — single `below_op_alert` template + 24h-window free-form. |
| 4 | Public site SEO. Email channel via Resend. |
| 5 | Multi-portal expansion — Bayut + Dubizzle scrapers. |
| 6 | Web push notifications. Premium tier subscriptions. Broker dashboard for managing inventory. |

The full engineering scope for client approval is in [`docs/BelowOP-Scope-For-Approval.docx`](docs/BelowOP-Scope-For-Approval.docx) with priority tiers (High / Medium / Low) and effort estimates.

---

## 7 · How to give feedback

Easiest: **WhatsApp Rami** with whatever comments while you're testing — screenshots welcome.

You can also browse the source on GitHub (https://github.com/ralch22/belowop-demo) — every spec doc and the full codebase is public-readable for your review.

For technical setup tasks on your side, the relevant guides live in `docs/`:

- [`docs/APIFY-SCHEDULE-SETUP.md`](docs/APIFY-SCHEDULE-SETUP.md) — **Rami's top priority** — step-by-step Apify schedule + webhook wiring
- [`docs/WhatsApp-Integration-Plan.md`](docs/WhatsApp-Integration-Plan.md) — Meta Cloud API direct integration plan (current path; deferred)
- [`docs/GHL-vs-Twilio.md`](docs/GHL-vs-Twilio.md) — vendor comparison (superseded by Meta direct plan)
- [`docs/BelowOP-Scope-For-Approval.docx`](docs/BelowOP-Scope-For-Approval.docx) — remaining engineering work + priorities
- [`docs/RTM_COVERAGE.md`](docs/RTM_COVERAGE.md) — 105 requirements mapped to current build state
- [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) — spec §8 acceptance criteria
- `docs/BelowOP-Twilio-Setup.pdf` — **archived** (Twilio path retired; kept for record)

---

*Built with the BelowOP-Handoff spec (CLAUDE.md, PWA_PRD.docx, SRS.docx, Solution_Architecture.pdf, Screens.md, UI.md, Variables.pdf).*
