# Apify Schedule — Setup & Verification

**For:** Rami
**Updated:** 2026-05-22
**Goal:** Wire the `azzouzana/propertyfinder-ads-search-results-pages-scraper` actor to run on a recurring schedule and post results to our webhook automatically. Today the pipeline is dormant — the 102 listings in production were ingested by one manual run.

**Estimated time:** 10–15 minutes in the Apify Console. Zero engineering work on our side (the webhook is already deployed and waiting).

---

## What you'll create

1. A **task** that wraps the scraper actor with our specific PropertyFinder search URLs as input
2. A **schedule** that runs that task every N hours
3. A **webhook** on that task that POSTs results to `belowop-demo.vercel.app/api/webhooks/apify` with our shared secret

After this, every scheduled run automatically ingests fresh listings into Postgres, deduplicated, with image-sync and alert-event emission happening as side-effects.

---

## Prerequisites

You need:
- An Apify account (https://apify.com — Google sign-in works)
- The `APIFY_WEBHOOK_SECRET` value currently set in Vercel (we'll use it as the shared secret)
- The `APIFY_TOKEN` already configured in Vercel (the webhook uses it to fetch dataset items after a run completes)

Both env vars are already on the Vercel project from earlier setup. We're not creating new ones.

---

## Plan / pricing notes

| Apify plan | Scheduled tasks | Cost | Recommendation |
|---|---|---|---|
| **Free** ($0/mo) | ❌ Not included | $5/mo platform credit | Not viable for production — no schedules |
| **Starter** ($49/mo) | ✅ Included | $49 platform credit + scraper pay-per-event | **Recommended for v1.** Plenty for our volume |
| Scale ($499/mo) | ✅ Included | $500 platform credit | Overkill until we add Bayut + Dubizzle |

**Scraper cost (separate from platform):** `azzouzana/propertyfinder-ads-search-results-pages-scraper` charges **~$1 per 1,000 listings scraped**. At our v1 cadence of every 6 hours × ~200 listings/run × 30 days = ~24,000 events/month = **~$24/month** in scraper events on top of the Starter platform fee. So total Apify cost: **~$73/month**.

If we go every 2 hours (matches spec §6 alert cadence): ~$72/month scraper events + $49 platform = **~$121/month**.

If we go every 30 min (the README's original suggestion): ~$288/month scraper + $49 = **~$337/month** — only justify this if we're paying clients waiting on instant alerts.

**My recommendation: every 6 hours for v1.** Bumps to every 2 hours when we have paying subscribers.

---

## Step-by-step

### 1 · Open the actor

1. Sign in at https://apify.com
2. Navigate to https://apify.com/azzouzana/propertyfinder-ads-search-results-pages-scraper
3. Click **Try for free** (one-time) — this attaches the actor to your account
4. You'll land on the actor's input page

### 2 · Create a task (wraps the actor with our specific input)

A "task" in Apify is a saved configuration. We use one task per scrape scope so we can have multiple schedules or vary inputs without editing the actor itself.

1. From the actor page, click **Create new task** (top right)
2. Name it: `belowop-pf-distress`
3. Set **Input** to the JSON below (Apify shows a JSON editor under the "Input" tab):

```json
{
  "startUrl": [
    {
      "url": "https://www.propertyfinder.ae/en/search?l=1&c=1&pf=1000000&fu=0&kw=below%20op&cs=off_plan&ob=nd"
    },
    {
      "url": "https://www.propertyfinder.ae/en/search?l=1&c=1&pf=1000000&fu=0&kw=below%20op&cs=completed&ob=nd"
    }
  ],
  "maxItems": 200,
  "proxyConfiguration": { "useApifyProxy": true }
}
```

   - First URL covers off-plan distress listings
   - Second URL covers completed/ready distress listings
   - `maxItems: 200` caps each scrape so a runaway query doesn't blow our budget
   - `useApifyProxy: true` is required — PropertyFinder rate-limits raw IPs

4. **Save** the task

### 3 · Add a webhook on the task

This is the critical piece — it's what makes the listings reach our database automatically.

1. Inside the task you just created, click the **Webhooks** tab (or "Integrations" depending on UI version)
2. Click **Add webhook**
3. Configure:

   | Field | Value |
   |---|---|
   | Event types | `Actor run succeeded` (only this one — not `created`, not `failed`) |
   | URL | `https://belowop-demo.vercel.app/api/webhooks/apify` |
   | Payload template | Leave as default (Apify's default template includes `eventData.actorRunId` and `resource.defaultDatasetId`, which is what our webhook reads) |
   | Headers (Headers tab — important!) | Add a custom header: <br/>**Name:** `Authorization` <br/>**Value:** `Bearer <APIFY_WEBHOOK_SECRET>` <br/>Paste the actual secret value from Vercel env vars |
   | Description | `BelowOP — ingest succeeded runs` |

4. **Save** the webhook

### 4 · Create the schedule

1. Apify Console → **Schedules** (left sidebar)
2. Click **Create new schedule**
3. Configure:

   | Field | Value |
   |---|---|
   | Name | `belowop-pf-distress-every-6h` |
   | Cron expression | `0 */6 * * *` (every 6 hours on the hour: 00:00, 06:00, 12:00, 18:00 UTC) |
   | Description | `Below OP — refresh PropertyFinder distress listings` |
   | Actor / task | Select the `belowop-pf-distress` task we created |

4. **Save**

   Other cron options if you want a different cadence:
   - Every 2 hours: `0 */2 * * *`
   - Every 30 min: `*/30 * * * *`
   - Daily at 6am UTC: `0 6 * * *`

### 5 · Test fire — verify it actually works

Don't wait 6 hours to find out something's miswired. Do a manual test now:

1. Apify Console → **Tasks** → `belowop-pf-distress`
2. Click **Start** (top right) — this fires the task immediately
3. Watch the run progress (typically 30–90 seconds for 200 items)
4. When it finishes (status: `SUCCEEDED`), Apify will fire the webhook
5. **Verify on our side** — open https://belowop-demo.vercel.app/admin
   - Check that "Total listings" went up (or that "Last activity" timestamp updated)
   - Or hit `/admin/preview` and pick a recent listing — if it shows today's data, the pipeline worked

If the count doesn't move:
- Apify Console → Runs → click your test run → **Webhooks** tab — Apify shows the response code from our webhook. 200 = good. 401 = wrong secret. 403 = our HMAC check rejected it. 5xx = our handler errored.
- If 401: re-check the `Authorization: Bearer <APIFY_WEBHOOK_SECRET>` header — secret must match Vercel env exactly, no quotes, no trailing whitespace
- If 5xx: send me the run ID and I'll pull Vercel logs

### 6 · Confirm the schedule is firing

Day after setup:
1. Apify Console → **Schedules** → click your schedule → **History** tab
2. You should see 4 runs in the last 24h (if every-6h cadence)
3. All should be `SUCCEEDED`

Week after setup:
1. Same view — 28 runs in last 7 days, all SUCCEEDED
2. Or just look at our `/admin` — "Total listings" should be growing daily as new units appear on PF

---

## What to monitor

Once the schedule is live, three metrics matter:

| Metric | Healthy range | Where to check |
|---|---|---|
| Apify run success rate | 100% | Apify Schedules → History |
| Items per run | 50–200 typical | Apify run page → "Items in dataset" |
| Our listings count change/day | +5 to +50 typical, with churn | `/admin` daily |

If items-per-run drops to near zero, PropertyFinder may have changed their search URL structure. Update the `startUrl` array in the task input.

---

## Troubleshooting

**"Webhook returned 401 Unauthorized"**
- Bearer secret mismatch. Compare Apify task webhook header value vs Vercel `APIFY_WEBHOOK_SECRET` env var character by character.

**"Webhook returned 500"**
- Our handler errored. Likely DB connection or upstream Apify dataset fetch failed. Get the run ID from Apify and ping me — I'll check Vercel logs.

**"Apify run keeps timing out"**
- `maxItems: 200` should keep runs under 90 seconds. If it's hitting 5+ min, PropertyFinder is rate-limiting. Either lower `maxItems` to 100 or add a longer `maxRequestRetries` in the input.

**"Listings show in Apify run but never in our database"**
- Webhook fired but data didn't ingest. Most likely cause: our webhook handler couldn't parse a price or `external_ref` from a malformed item. The handler logs item-level failures via `console.error` — check Vercel logs around the run timestamp.

**"Apify scraper got blocked by PropertyFinder"**
- We're using `useApifyProxy: true` already, which rotates through their pool. If it still gets blocked, PropertyFinder has added new bot detection. The maintained azzouzana actor usually updates within a week; check the actor page for a new version.

---

## What happens next (our side, once the schedule is firing)

Once you confirm the schedule is running and we have 24h of real run data, I'll build:

1. **`ingestion_runs` log table** — every webhook invocation gets a row with stats (received, inserted, updated, errored, withdrawn)
2. **Stale-listing pruning** — 2 consecutive misses → auto-`withdrawn_at` (decision pinned: conservative)
3. **`/admin/pipeline` page** — single-glance dashboard showing run history + freshness indicators
4. **Watchdog cron** — daily check: if no Apify run in 26h OR no new listings in 48h, Telegram-DM Rami

Together that gives us a "is the data alive?" answer in one click from `/admin`.

---

## Source links

- [Apify Console](https://console.apify.com/)
- [azzouzana actor](https://apify.com/azzouzana/propertyfinder-ads-search-results-pages-scraper)
- [Apify pricing](https://apify.com/pricing)
- [Apify webhook docs](https://docs.apify.com/platform/integrations/webhooks)
- [Apify schedule docs](https://docs.apify.com/platform/schedules)
