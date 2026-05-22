# Below OP — Launch Checklist

> Pre-launch ops checklist mapped to the spec's §8 acceptance criteria. Source of truth: handoff `CLAUDE.md` §8. This file tracks *current state*; the spec defines the bar.

**Legend:** ✅ Done · ⏳ Pending (we control) · 🔴 Blocked by external party

---

## Smallest set to ship publicly

Per the PM audit, the critical path to a *public* launch is shorter than the full §8 list. Everything else can land as a fast-follow.

| # | Item | Status |
|---|---|---|
| 1 | RERA broker arrangement confirmed | 🔴 Blocked-by-external (Legal / Rami) |
| 2 | Twilio WhatsApp Business templates approved (`TPL_BELOWOP_LISTING`, `TPL_BELOWOP_PRICEDROP`) — for 1:1 DMs to subscribers + Rami | 🔴 Blocked-by-external (Meta SLA 24–48 h) |
| 3 | Telegram bot + broadcast channel live, env vars set on Vercel | ✅ Live — `@DubaiPropertydeal`, end-to-end automated |
| 4 | WhatsApp Channel (`@DubaiPropertydeal`) — public broadcast surface | ✅ Channel live · alerts post manually via `/admin/relay` (no Channels API exists) |
| 5 | Vercel Pro upgrade so crons can run `*/5` (image sync) and `*/2` (alerts) | ⏳ Pending (Rami) |
| 6 | Apify scheduled task wired to the webhook + `APIFY_TOKEN` set | ⏳ Pending (Rami) |
| 7 | `BROKER_WHATSAPP_DIRECT`, `LEADS_NOTIFY_WHATSAPP` set in Vercel production env | ⏳ Pending Twilio account (`LEADS_NOTIFY_TELEGRAM` ✅) |
| 8 | Smoke test: one real listing flows end-to-end (ingest → image sync → Telegram alert → lead capture → broker notify) | ✅ Verified live with Sarah Al-Mansouri test lead |

Everything in the §8 acceptance list below either already passes or depends on one of the above.

---

## §8 Acceptance criteria — current state

### 8.1 — RERA / broker arrangement confirmed

**Status:** 🔴 Blocked-by-external
**Owner:** Legal / Rami
**Done:** Compliance posture documented (`docs/SECURITY.md`, spec §7.1). Site copy avoids any non-broker claims.
**Needed:** Written confirmation that Emerge Digital is RERA-registered, *or* a signed partnership with a registered brokerage with leads routed accordingly.

### 8.2 — PWA installable on iOS/Android, Lighthouse PWA + Perf ≥ 90

**Status:** ✅ Done (installable) · ⏳ Pending (Lighthouse run on production)
**Owner:** Eng
**Done:** `next-pwa` configured (`next.config.js`), `public/manifest.json` with 192/512/maskable icons, custom `InstallPrompt` with iOS instructional variant, offline fallback page at `/offline`, service worker registered, runtime caching for listings/Blob images/PF CDN/OG/Next image optimizer.
**Needed:** Run Lighthouse on the live URL and attach screenshots; tune any sub-90 metric.

### 8.3 — Scraper runs every 30 min, > 99% success over 7-day window

**Status:** ⏳ Pending
**Owner:** Rami (Apify config)
**Done:** Webhook (`/api/webhooks/apify`) is live, HMAC-verified, parses the azzouzana schema, upserts listings + writes `price_history` + queues `alert_events`. 102 real listings already ingested.
**Needed:** Apify task scheduled to 30-min cadence with webhook attached; 7-day rolling success metric collected from Apify run history once cadence is live.

### 8.4 — Image worker rehosts to Blob within 10 min of ingest

**Status:** ⏳ Pending (cadence) · ✅ Done (mechanism)
**Owner:** Rami (Vercel Pro) / Eng (cadence change)
**Done:** `/api/image-sync` downloads source thumbnails, transcodes to 800w WebP via `sharp`, uploads to Vercel Blob, writes `blob_image_urls` + `blob_synced_at`. Verified working on real listings; admin "Run now" control available.
**Needed:** Vercel Pro upgrade so the cron can run `*/5` instead of daily — see "Smallest set" item 4.

### 8.5 — Public table renders < 1.5 s on cold 4G

**Status:** ⏳ Pending (formal measurement)
**Owner:** Eng
**Done:** Home page is a server component fetching from Postgres with indexed queries (`idx_listings_listed_at`, `idx_listings_active`); Blob-hosted WebP thumbs; PWA cache-first for static assets.
**Needed:** Run WebPageTest or Lighthouse mobile-4G profile, document number, optimize if > 1.5 s.

### 8.6 — No PropertyFinder references on public surface (CI guardrail)

**Status:** ✅ Done
**Owner:** Eng
**Done:** `scripts/check-no-pf-refs.sh` runs in CI on every push and PR (`.github/workflows/ci.yml`). Scans `app/`, `components/`, `lib/alert-format.ts`, `lib/notify.ts`; excludes admin and webhook (internal infra). All public copy uses internal opaque IDs.

### 8.7 — Row click opens lead modal; WA + TG ping to Rami within 30 s

**Status:** ⏳ Pending live test
**Owner:** Eng (verify) / Rami (channels)
**Done:** `LeadModal` opens on row click; `POST /api/leads` writes the row, KV-deduplicates, and calls `lib/notify.ts` which fires both Twilio + Telegram with the broker template. Notification path is stubbed and logged when env vars are missing.
**Needed:** Live end-to-end test once Twilio templates are approved and channel env vars are set. Measure the 30-s SLA on the test capture.

### 8.8 — New below-OP listing appears in WA + TG within 5 min

**Status:** ⏳ Pending (cadence) · ✅ Done (mechanism)
**Owner:** Rami (Vercel Pro)
**Done:** `/api/alerts/dispatch` reads pending `alert_events`, formats via `lib/alert-format.ts` (same code path as `/api/admin/preview-alert`), sends to subscriber list + broadcast channel, marks `dispatched_at`.
**Needed:** Vercel Pro so the alerts cron can run `*/2`. Today the dispatcher runs daily.

### 8.9 — User can subscribe via `/alerts` in < 60 s

**Status:** ✅ Done
**Owner:** Eng
**Done:** `/alerts` opt-in form, `/api/subscribe` creates pending subscription + sends double-opt-in confirm link, `/api/subscribe/confirm` activates, `/api/unsubscribe` opts out with one-click token. Subscriber table has channel/contact unique constraint and timestamps for audit.

### 8.10 — Every RTM requirement linked to ≥ 1 passing test

**Status:** ⏳ Pending (audit)
**Owner:** Eng
**Done:** 36 description-parser cases (`tests/description-parser.test.ts`) cover OP, handover, view, floor, payment, BUA, plot size, unit type composition, feature extraction. 12 HMAC tests (`tests/hmac.test.ts`) cover the webhook trust boundary. CI gates merges on both suites + type check + PF guardrail.
**Needed:** Walk through `RTM.xlsx`, link each requirement ID to its test or mark it as "manual QA" with a steps doc.

---

## Notes

- The spec's `vercel.json` cadence (`*/2`, `*/5`) is *intentionally* not in the repo until Pro is enabled — running them on Hobby would trip the cron quota and silently fail.
- The `notify.ts` and Telegram stubs return success-without-send when env vars are missing so QA + local dev never block on a real send.
- If PropertyFinder issues a takedown, pause the Apify task, flip an admin kill switch (TBD), and flush Blob within 7 days per spec §7.4.
