# Below OP

> Dubai property tracker PWA. Surfaces below-original-price listings, pushes alerts to WhatsApp and Telegram, and captures leads for the broker.

**Live:** https://belowop-demo.vercel.app
**Spec:** see the handoff bundle (`CLAUDE.md`, `PWA_PRD.docx`, `SRS.docx`) shipped to the operator. This README documents the *as-built* repo.

---

## Architecture

| Layer | Service |
|---|---|
| Frontend / API | Next.js 14 App Router on Vercel |
| Database | Neon Postgres (via `@neondatabase/serverless` with WebSocket pool — `@vercel/postgres` had read-after-write inconsistencies on its HTTP driver) |
| Image storage | Vercel Blob (`belowop-images` store, public) |
| Rate limit / dedup | Vercel KV (Upstash Redis) |
| Cron | Vercel Cron (Hobby = daily; Pro = sub-hour cadence — see below) |
| Scraper | Apify — `azzouzana/propertyfinder-ads-search-results-pages-scraper` |
| WhatsApp | Twilio (sandbox for dev, business templates for prod) |
| Telegram | Telegram Bot API |

The scraper is **external infrastructure** — we consume the maintained marketplace actor (~$1 per 1,000 listings) rather than running our own. Listings flow Apify → HMAC-verified webhook → Postgres → image sync to Blob → alert queue → WhatsApp/Telegram dispatch.

---

## What's done

- **102 real PropertyFinder listings** ingested through `/api/webhooks/apify`, deduped on `external_ref`, with full broker-template fields (unit type, bathrooms, features, view, floor, handover, payment status, BUA, plot size, sub-location, furnished).
- **Image sync to Vercel Blob** — `lib/image-sync` downloads source thumbnails, transcodes to 800w WebP via `sharp`, uploads to the `belowop-images` Blob store, and writes the public URLs back to the listing.
- **Broker canonical alert template** (`lib/alert-format.ts`) — matches Jad's WhatsApp + Telegram format from `Variables.pdf`. Same code path drives `/api/alerts/dispatch` and `/api/admin/preview-alert` so there's no QA drift.
- **Admin dashboard** (`/admin`) — stats (listings, leads 24h, alert queue, subscribers), recent activity, "Run now" controls for image sync + alerts dispatch, manual ingest form.
- **PWA service worker** — `next-pwa` config with stale-while-revalidate for listings/OG, cache-first for Blob and PF CDN images, offline fallback page.
- **Custom install prompt** (`components/InstallPrompt.tsx`) — visit-count + dwell heuristic, iOS instructional variant, 30-day dismissal TTL.
- **Privacy + Terms pages** (`/privacy`, `/terms`) — UAE PDPL alignment, lead-deletion contact path.
- **CI guardrail** (`.github/workflows/ci.yml`) — runs `tsc --noEmit`, `npm test`, `npm run test:hmac`, and `scripts/check-no-pf-refs.sh` on every push to main and every PR.
- **Tests** — 36 description-parser cases (`tests/description-parser.test.ts`) and 12 HMAC verification cases (`tests/hmac.test.ts`), zero-dep micro-framework.

## What still needs setup

External / out-of-codebase prerequisites for public launch:

| Item | Owner | Notes |
|---|---|---|
| Twilio account + WhatsApp Business Sender approval | Rami | For **1:1 WhatsApp** to opted-in subscribers + lead DM to Rami. Submit `TPL_BELOWOP_LISTING` and `TPL_BELOWOP_PRICEDROP` templates; Meta SLA 24–48 h. **Cannot** post to WhatsApp Channels — see below. |
| Telegram bot + broadcast channel | ✅ Live | `@DubaiPropertydeal` channel automated end-to-end; `@DubaiPropertyDealsbot` DMs leads to Rami |
| RERA broker registration (or partner brokerage agreement) | Legal / Rami | Launch-blocker per spec §7.1 — site presents listings as broker inventory |
| Vercel Pro upgrade | Rami | Required for `*/5` image-sync and `*/2` alert dispatch crons; Hobby is daily-only |
| Apify scheduled run + webhook wiring | Rami | See "Apify setup" below |

### Three WhatsApp surfaces, three different stories

- **WhatsApp Channel** (e.g. `@DubaiPropertydeal`, `whatsapp.com/channel/0029Vb8...`) — public broadcast feed managed via the WhatsApp app. **No API exists.** Only the human admin can post. The site links to it via `NEXT_PUBLIC_WHATSAPP_CHANNEL_URL`; `/admin/relay` prepares each alert (caption + hero image + open-channel button) for one-tap manual posting. Most Dubai broker channels run this way.
- **WhatsApp 1:1 (Twilio Business API)** — sends to individual phone numbers. Needs a Twilio account + Meta template approval. Used for lead DMs to Rami's phone + alerts to opted-in subscribers. Code wired in `lib/twilio.ts`; awaiting credentials.
- **Unofficial WhatsApp Web automation (Maytapi / Wassenger)** — **do not use.** Against WhatsApp ToS; risks a permanent ban of the channel + admin account.

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
lib/                  db, kv, twilio, telegram, notify, hmac, op-parser,
                      description-parser, alert-format, format, listings,
                      admin-auth, admin-data
db/
  migrations/         0001_init.sql, 0002_broker_fields.sql
  migrate.ts, seed.ts
scripts/              check-no-pf-refs.sh (CI guardrail), gen-icons.ts
tests/                description-parser.test.ts, hmac.test.ts
docs/                 SECURITY.md, LAUNCH_CHECKLIST.md
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

Without `POSTGRES_URL` / `KV_*` / `TWILIO_*` / `TELEGRAM_*` set, every dependent path falls back to a console log + stub success — the UI still renders for design review.

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

We consume `azzouzana/propertyfinder-ads-search-results-pages-scraper`. Pricing is roughly $1 per 1,000 listings.

1. Sign in at https://apify.com, open the actor, click **Try for free**.
2. Create a task with input:
   ```json
   {
     "startUrl": [
       { "url": "https://www.propertyfinder.ae/en/search?l=1&c=1&pf=1000000&fu=0&kw=below%20op&cs=off_plan&ob=nd" },
       { "url": "https://www.propertyfinder.ae/en/search?l=1&c=1&pf=1000000&fu=0&kw=below%20op&cs=completed&ob=nd" }
     ],
     "maxItems": 200
   }
   ```
3. Schedule the task every 30 min.
4. Add a webhook (`ACTOR.RUN.SUCCEEDED` → `https://belowop-demo.vercel.app/api/webhooks/apify`) with header `Authorization: Bearer $APIFY_WEBHOOK_SECRET`.
5. Set `APIFY_TOKEN` on Vercel so the webhook can fetch dataset items.

OP parsing (`lib/op-parser.ts`) pulls the original price from PropertyFinder's free-text description — patterns like `OP: AED 2,300,000`, `down from AED 2.3M`, `12% below OP`. If no OP is found, the listing is skipped (we never invent a baseline).

---

## Reference

- Spec acceptance criteria → `docs/LAUNCH_CHECKLIST.md`
- Security model → `docs/SECURITY.md`
- Full product / requirements → handoff bundle (`CLAUDE.md`, `PWA_PRD.docx`, `SRS.docx`, `Solution_Architecture.pdf`)
