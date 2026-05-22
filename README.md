# Below OP

> Dubai property tracker PWA. Surfaces below-original-price Dubai inventory in a filterable table; broadcasts new finds to a Telegram channel; relays leads to the broker via Telegram bot.

**Live:** https://belowop-demo.vercel.app
**Source:** https://github.com/ralch22/belowop-demo (public for client review)

**Current priority** (per client direction 2026-05-22): the **table** — consistent ingestion, freshness, deduplication, pruning. Multi-channel alert delivery (WhatsApp, email) is **deferred**; the Telegram channel + manual `/admin/relay` cover the alert use case for now.

---

## Architecture

| Layer | Service | Status |
|---|---|---|
| Frontend / API | Next.js 14 App Router on Vercel | ✅ Live |
| Database | Neon Postgres (via `@neondatabase/serverless` with WebSocket pool — `@vercel/postgres` had read-after-write inconsistencies on its HTTP driver) | ✅ Live |
| Image storage | Vercel Blob (`belowop-images` store, public) | ✅ Live |
| Rate limit / dedup | Vercel KV (Upstash Redis) | ✅ Live |
| Cron | Vercel Cron (Hobby = daily; Pro = sub-hour cadence — see below) | ✅ Hobby |
| Scraper | Apify — `azzouzana/propertyfinder-ads-search-results-pages-scraper` | 🟡 Schedule not wired ([setup](docs/APIFY-SCHEDULE-SETUP.md)) |
| Telegram | Telegram Bot API — `@DubaiPropertydeal` channel + `@DubaiPropertyDealsbot` lead DMs | ✅ Live |
| WhatsApp 1:1 | Meta Cloud API direct (planned; Twilio path retired) | ⏳ Deferred ([plan](docs/WhatsApp-Integration-Plan.md)) |
| WhatsApp Channel posting | Manual via `/admin/relay` (Meta has no Channels API) | 🟡 Manual workflow |

We consume Apify's maintained marketplace actor (~$1 per 1,000 listings) rather than running our own scraper. Listings flow: **Apify → HMAC-verified webhook → Postgres → image sync to Blob → Telegram channel + relay queue**.

> **Pipeline status:** The 102 listings currently in production were ingested by a single manual Apify run. Until Rami completes [docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md), the data is frozen. Pipeline-hardening work (ingestion log, stale pruning, observability page, watchdog) is paused awaiting that wire-up.

---

## What's done

- **102 real PropertyFinder listings** ingested through `/api/webhooks/apify`, deduped on `external_ref`, with full broker-template fields (unit type, bathrooms, features, view, floor, handover, payment status, BUA, plot size, sub-location, furnished). *Ingested by a single manual Apify run; recurring schedule pending — see [docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md).*
- **Image sync to Vercel Blob** — `app/api/image-sync/route.ts` downloads source thumbnails, transcodes to 800w WebP via `sharp`, uploads to the `belowop-images` Blob store, and writes the public URLs back to the listing.
- **Broker canonical alert template** (`lib/alert-format.ts`) — matches Jad's broker post format from `Variables.pdf`. Same code path drives `/api/alerts/dispatch` and `/api/admin/preview-alert` so there's no QA drift.
- **Telegram broadcast** — `@DubaiPropertydeal` channel auto-posts every new below-OP unit (hero image + canonical caption); `@DubaiPropertyDealsbot` DMs Rami the moment a buyer submits a lead.
- **WhatsApp Channel one-click relay** — `/admin/relay` prepares each alert (caption + hero + open-channel button) for manual posting into the `@DubaiPropertydeal` WhatsApp Channel. (Meta provides no Channels API; this is the supported workflow.)
- **Admin dashboard** (`/admin`) — stats (listings, leads 24h, alert queue, subscribers), recent activity, "Run now" controls for image sync + alerts dispatch, manual ingest form, alert preview, relay tool.
- **PWA service worker** — `next-pwa` config with stale-while-revalidate for listings/OG, cache-first for Blob, offline fallback page; custom install prompt with iOS instructional variant.
- **Privacy + Terms pages** (`/privacy`, `/terms`) — UAE PDPL alignment, lead-deletion contact path.
- **CI guardrail** (`.github/workflows/ci.yml`) — runs `tsc --noEmit`, `npm test`, `npm run test:hmac`, and `scripts/check-no-pf-refs.sh` on every push to main and every PR.
- **Automated tests** — 36 description-parser cases (`tests/description-parser.test.ts`) + 12 HMAC verification cases (`tests/hmac.test.ts`) + Telegram MarkdownV2 escape cases (`tests/format-telegram.test.ts`), zero-dep micro-framework.

## What still needs setup

External / out-of-codebase prerequisites for public launch, ordered by current priority:

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | **Apify scheduled run + webhook wiring** | Rami | Top priority — the table is dormant without it. Step-by-step guide: [docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md). |
| 2 | RERA broker registration (or partner brokerage agreement) | Legal / Rami | Launch-blocker per spec §7.1 — site presents listings as broker inventory |
| 3 | Vercel Pro upgrade | Rami | Required for `*/5` image-sync + `*/2` alert dispatch crons (spec §6); Hobby is daily-only |
| 4 | WhatsApp 1:1 — Meta Cloud API credentials + `below_op_alert` template approval | Jad | **Deferred.** Jad's WABA "Distress Deals Dubai" (+1 555-976-4984) is already Meta-verified and Marketing-enabled. We just need PHONE_NUMBER_ID + permanent System User token + one template approved. See [docs/WhatsApp-Integration-Plan.md](docs/WhatsApp-Integration-Plan.md). |

### Pipeline hardening (paused on item 1 above)

Five tasks queued to land once the Apify schedule is firing and we have ~24h of real run data to design around:

| Task | Description |
|---|---|
| `ingestion_runs` log table | One row per webhook invocation: items received/inserted/updated/withdrawn/errored, status |
| Stale-listing pruning (2-miss conservative) | Listing absent from 2 consecutive scrapes → `withdrawn_at = NOW()`; protects against partial-scrape false positives |
| `/admin/pipeline` page | Single-glance dashboard: last 30 days of runs + freshness indicators |
| Watchdog cron | Daily check: no run in 26h **or** no new listings in 48h **or** last run errored → Telegram-DM Rami |
| Apify schedule itself | Documented for Rami at [docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md) |

### WhatsApp landscape — three surfaces, three stories

- **WhatsApp Channel** (`@DubaiPropertydeal`, `whatsapp.com/channel/...`) — public broadcast feed managed via the WhatsApp app. **Meta has no Channels API.** Only the human admin can post. The site links to it via `NEXT_PUBLIC_WHATSAPP_CHANNEL_URL`; `/admin/relay` prepares each alert (caption + hero + open-channel button) for manual posting. This is how most Dubai broker channels operate.
- **WhatsApp 1:1 (Business API)** — sends to individual phone numbers. **Twilio path retired.** Planned via **Meta Cloud API direct** against Jad's existing WABA (see [docs/WhatsApp-Integration-Plan.md](docs/WhatsApp-Integration-Plan.md)). Currently deferred behind table-pipeline work. Comparison of options at [docs/GHL-vs-Twilio.md](docs/GHL-vs-Twilio.md).
- **Unofficial WhatsApp Web automation (Maytapi / Wassenger)** — **do not use.** Violates WhatsApp ToS; risks permanent ban of the channel + admin account.

---

## File structure

```
app/                  Next.js App Router pages + route handlers
  api/                webhooks/apify, leads, image-sync, alerts/dispatch,
                      subscribe, unsubscribe, og, admin/{db,login,parse,
                      preview-alert,run}
  admin/              Admin dashboard, login, ingest, preview
  alerts/             S-03 opt-in, S-04 confirmed
  about/ privacy/ terms/ offline/ not-found/  Static + status pages
components/           ListingsView, ListingTable, ListingCard, FilterBar,
                      LeadModal, Pagination, Nav, Footer, Logo, InstallPrompt,
                      AdminRunButtons, IngestForm, Toast, ThemeToggle
lib/                  db, kv, telegram, notify, hmac, op-parser,
                      description-parser, alert-format, format, listings,
                      admin-auth, admin-data, twilio (retired — see WhatsApp plan)
db/
  migrations/         0001_init.sql, 0002_broker_fields.sql
  migrate.ts, seed.ts
scripts/              check-no-pf-refs.sh (CI guardrail), gen-icons.ts
tests/                description-parser.test.ts, hmac.test.ts,
                      format-telegram.test.ts
docs/                 APIFY-SCHEDULE-SETUP.md  (← Rami's next step)
                      WhatsApp-Integration-Plan.md  (Meta Cloud direct, deferred)
                      GHL-vs-Twilio.md  (vendor comparison, superseded by plan above)
                      LAUNCH_CHECKLIST.md, RTM_COVERAGE.md, SECURITY.md
                      BelowOP-Scope-For-Approval.docx  (client priorities)
                      BelowOP-Twilio-Setup.{docx,pdf}  (archived — Twilio path retired)
public/               manifest.json, sw.js (generated), icons/
```

---

## Local dev quickstart

**Prerequisites:** Node.js 20+, npm 10+, Vercel CLI (`npm i -g vercel`).

```bash
# 1. Clone + install
cd ~/Desktop/belowop-demo
npm install

# 2. Pull env from Vercel (requires `vercel link` first time)
npx vercel env pull .env.local --environment=production

# 3. Apply migrations (idempotent)
npm run db:migrate

# 4. Start dev server
npm run dev   # http://localhost:3000
```

Without `POSTGRES_URL` / `KV_*` / `TELEGRAM_*` (and, once wired, `META_WHATSAPP_*`) set, every dependent path falls back to a console log + stub success — the UI still renders for design review.

---

## Test commands

```bash
npm test            # 36 description + OP parser tests
npm run test:hmac   # 12 webhook signature tests
npm run check:pf    # CI guardrail — no PropertyFinder refs on public surface
npx tsc --noEmit    # type check
```

The CI workflow (`.github/workflows/ci.yml`) runs all four on every push to `main` and on PRs.

---

## Deploy

```bash
# Production (auto-deploys from main on push)
git push origin main

# Manual deploy
npx vercel --prod --yes
```

Crons are declared in `vercel.json`. On Hobby tier they run daily. To enable real-time alerts (spec §6 calls for `*/2` and `*/5`), upgrade to Pro and update:

```json
{ "path": "/api/image-sync",      "schedule": "*/5 * * * *" },
{ "path": "/api/alerts/dispatch", "schedule": "*/2 * * * *" }
```

---

## Apify setup (one-time)

The full step-by-step is at **[docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md)** — kept in a single doc so the README doesn't drift from the operational truth. Summary:

- We consume `azzouzana/propertyfinder-ads-search-results-pages-scraper` (~$1 per 1,000 listings on top of an Apify Starter plan)
- Recommended cadence for v1: every 6 hours (`0 */6 * * *`) — ~$73/mo total
- Webhook posts `actor.run.succeeded` events to `/api/webhooks/apify` with `Authorization: Bearer $APIFY_WEBHOOK_SECRET`
- `APIFY_TOKEN` env var lets the webhook handler fetch dataset items after a run

OP parsing (`lib/op-parser.ts`) pulls the original price from PropertyFinder's free-text description — patterns like `OP: AED 2,300,000`, `down from AED 2.3M`, `12% below OP`. If no OP is found, the listing is skipped (we never invent a baseline).

---

## Documentation

| Doc | Purpose |
|---|---|
| [docs/APIFY-SCHEDULE-SETUP.md](docs/APIFY-SCHEDULE-SETUP.md) | **Top priority** — Rami's step-by-step to wire the recurring Apify run |
| [docs/WhatsApp-Integration-Plan.md](docs/WhatsApp-Integration-Plan.md) | Meta Cloud API direct (deferred); supersedes Twilio path |
| [docs/GHL-vs-Twilio.md](docs/GHL-vs-Twilio.md) | Vendor comparison from earlier evaluation; superseded by the WhatsApp plan |
| [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) | Spec §8 acceptance criteria mapped to current state |
| [docs/RTM_COVERAGE.md](docs/RTM_COVERAGE.md) | 105 requirements traced to code + tests |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model, threat surface, secrets handling |
| [CLIENT_TEST.md](CLIENT_TEST.md) | Client-facing test plan |
| `docs/BelowOP-Scope-For-Approval.docx` | Engineering scope for client approval (priority tiers + effort) |
| `docs/BelowOP-Twilio-Setup.{docx,pdf}` | **Archived** — Twilio onboarding guide retained for record; current path is Meta direct |
