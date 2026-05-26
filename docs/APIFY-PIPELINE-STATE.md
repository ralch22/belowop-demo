# Apify Pipeline — Live Wiring State

**Updated:** 2026-05-26 (revision 2 — switched to shahidirfan, now producing items)
**Status:** ✅ Live · ✅ Data flowing · 80 real listings ingested 2026-05-26 11:29 UTC

## TL;DR (latest)

After azzouzana stopped producing items (likely PF anti-bot block), switched
the task to **shahidirfan/Propertyfinder-Scraper**. First production run
returned 80 real "Below OP" listings in 39 seconds. Webhook delivered with
200 OK. All 80 items normalised through the schema adapter (`isShahidirfan`
+ `normaliseShahidirfan` in `app/api/webhooks/apify/route.ts`) and ingested
via the existing parser path.

**Current Apify resources:**

| Resource | ID | Notes |
|---|---|---|
| Task `belowop-pf-distress` | `V0jMKxt40XCabABRB` | shahidirfan~Propertyfinder-Scraper |
| Webhook | `ZI313ilyRrxX38nBJ` | ACTOR.RUN.SUCCEEDED → /api/webhooks/apify (Bearer auth) |
| Schedule | `6raEPtjb3hfv0ffC1` | `0 */6 * * *` UTC, enabled |

Previous azzouzana-based resources (Voer7UfEC0XaQfw9N, TEUfokbCWlYz97dDE,
6ouP8WdeH1zYctqkt) were deleted in the same session.

---

## Original wiring journey (kept for context)

## What's wired (API-driven, no UI clicks)

All three resources created via Apify REST API. No manual setup remaining on Jad's side.

| Resource | ID | Config |
|---|---|---|
| Actor task `belowop-pf-distress` | `Voer7UfEC0XaQfw9N` | Wraps `azzouzana/propertyfinder-ads-search-results-pages-scraper` with `startUrl` (Dubai PF below-OP search) + `maxItems: 200` |
| Webhook | `TEUfokbCWlYz97dDE` | `ACTOR.RUN.SUCCEEDED` → `https://belowop-demo.vercel.app/api/webhooks/apify` with `Authorization: Bearer {APIFY_WEBHOOK_SECRET}` |
| Schedule | `6ouP8WdeH1zYctqkt` | `0 */6 * * *` (every 6h UTC), enabled |

Rotated `APIFY_WEBHOOK_SECRET` (fresh 48-char hex value, set in Vercel Production + Development, redeployed).

## What's NOT working — the actor itself

The `azzouzana` scraper is **returning 0 items per run** across all URLs tested today:

| URL tested | Items | Run duration |
|---|---|---|
| Original docs URL (`kw=below%20op`, `cs=off_plan`) | 0 | 4.6s |
| Broader URL (no `cs` filter) | 0 | 4.7s |
| Actor's own default prefill URL (rentals, known-good) | 0 | 5.0s |

**All runs return SUCCEEDED status with `exitCode: 0`** — the actor exits cleanly, just produces nothing. Logs are encrypted (the actor uses Apify's log-encryption feature) so we can't see the underlying cause.

**Apify-side metrics for the actor:**
- 957 SUCCEEDED / 1 FAILED / 1 ABORTED in last 30 days (99.8% "success" rate by Apify's metric)
- 5.0/5 user review rating
- Last code update: 2026-05-12 (2 weeks ago)

The "success rate" is misleading — Apify counts "exited cleanly" as success even if 0 items were scraped. The actor is likely getting blocked by PropertyFinder's anti-bot but failing silent.

## Hypotheses for why it's broken

1. **PropertyFinder updated anti-bot recently** — the actor's proxy + UA strategy no longer evades detection
2. **Search URL format changed on PF's side** — the `kw=` and `cs=` parameters may have been renamed or made stricter
3. **Actor is on a build that needs an update** — but only the maintainer (`azzouzana`) can fix
4. **Apify Proxy rotation** — our IP pool might just be having a bad hour

We can't tell which until either it starts working again, OR azzouzana ships an update, OR we test a different actor.

## Alternatives in Apify store (for future, NOT actioned)

```
shahidirfan/Propertyfinder-Scraper          793 runs/30d  ★5  ← top alternative
crawlerbros/propertyfinder-scraper           84 runs/30d  ★4.15
redoubtable_bubble/dubai-real-estate-...     77 runs/30d  ★5  ← bonus: covers Bayut+Dubizzle too
happyendpoint/propertyfinder-scraper         44 runs/30d  ★5
dz_omar/propertyfinder-scraper               19 runs/30d  ★5
```

If azzouzana stays broken for >48h, switch to `shahidirfan/Propertyfinder-Scraper`. Effort: ~30 min to map its output schema to our DB schema in `app/api/webhooks/apify/route.ts`. Same webhook URL, same task/schedule pattern.

## Why we're not pursuing this right now

Per client direction 2026-05-26 ("just fix the table"), the priority is:
1. Logging every ingestion run (so when azzouzana DOES work, we see it)
2. Auto-removing stale listings
3. `/admin/pipeline` dashboard
4. Watchdog Telegram alert when no run produces items

The 4 pipeline-hardening tasks (#65–#68) ship next. They're designed to detect this exact situation: when zero items come in, watchdog fires. Switching scrapers is a 30-min change once the infrastructure is in place.

## Manual fallback during the dry spell

If we need fresh data NOW (e.g. for a demo), the existing `/admin/ingest` page accepts pasted Apify-format JSON. Workflow:

1. Find listings manually on `propertyfinder.ae`
2. Use any browser-side tool (devtools network tab, or a generic web scraper) to extract the listing data as JSON matching the azzouzana schema
3. Paste into `/admin/ingest`
4. Listings appear in our table immediately

Not scalable but works for one-off updates.

## Things to monitor

| Indicator | Where | What to do |
|---|---|---|
| Daily Apify run count | console.apify.com/schedules | Confirm `0 */6 * * *` is firing (4 runs/day) |
| Items per run | console.apify.com/actor-tasks/Voer7UfEC0XaQfw9N/runs | If >0, pipeline is alive |
| New listings in our DB | `/admin` | Watch the "Total listings" count |
| Webhook delivery status | console.apify.com/webhooks/TEUfokbCWlYz97dDE | Confirm 200 responses from our endpoint |
| Watchdog Telegram alerts | `@DubaiPropertyDealsbot` DMs (after task #68) | Will fire if 24h+ without new listings |

## Reproduce: fire one run by hand

If azzouzana starts working again, you can verify with:

```bash
curl -X POST -H "Authorization: Bearer $APIFY_TOKEN" \
  "https://api.apify.com/v2/actor-tasks/Voer7UfEC0XaQfw9N/runs"
```

(Or just hit the "Start" button on the task in Apify console.)

The webhook will POST to `/api/webhooks/apify` within ~60s of run completion. New listings appear in `/admin` shortly after.

## Token rotation needed

- `APIFY_TOKEN` (apify_api_trW...) — still in transcript history. Rotate at console.apify.com/account/integrations as soon as we have a working alternative or scheduled run going.
- `APIFY_WEBHOOK_SECRET` — rotated in this session (fresh value set in Vercel Production + Development). The pre-rotation value is effectively dead.
