# Below OP — Security & Compliance

Last reviewed: 2026-05-21. Owner: Security Engineer (this doc lives in-repo so
it stays alongside the code it describes).

## 1. Auth model

| Surface | Mechanism | Notes |
|---|---|---|
| Public listings / inquiry form | None (public read, no PII out) | Inquiry POST gated by rate limit + consent flag |
| `/admin/**` dashboard | `ADMIN_TOKEN` env var → `belowop_admin` HttpOnly cookie | Token compared via `timingSafeEqual` in `lib/admin-auth.ts` |
| `/api/webhooks/apify` ingest | HMAC-SHA256 over raw body in `x-belowop-signature`; shared `APIFY_WEBHOOK_SECRET` | Verified in constant time, length-checked first (`lib/hmac.ts`) |
| Cron-triggered routes (`/api/image-sync`, `/api/alerts/dispatch`) | `CRON_SECRET` shared with Vercel cron | Vercel injects header; route rejects mismatch |
| Subscription confirm / unsubscribe | One-time `confirm_token` UUID stored alongside the subscription row | Double-opt-in (PDPL §7.10) |

### Sensitive env vars (do not log, do not expose to the client bundle)

```
ADMIN_TOKEN
APIFY_WEBHOOK_SECRET
CRON_SECRET
POSTGRES_URL / POSTGRES_URL_NON_POOLING
KV_REST_API_TOKEN / KV_REST_API_URL
BLOB_READ_WRITE_TOKEN
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
TELEGRAM_BOT_TOKEN
LEADS_NOTIFY_WHATSAPP / LEADS_NOTIFY_TELEGRAM
```

All are configured per-environment in Vercel. None are referenced from
`NEXT_PUBLIC_*` and none appear in the client bundle.

## 2. PDPL compliance posture

UAE Federal Decree-Law No. 45 of 2021. The full user-facing policy lives at
`/privacy`. Summary:

- **What we collect**: name, WhatsApp number, optional message, listing_ref,
  IP hash (SHA-256, 16 chars), consent flag, consent timestamp.
- **Why**: route inquiry to a licensed broker — only purpose.
- **Lawful basis**: explicit unbundled consent (opt-in checkbox).
- **Retention**: until the lead is resolved + 12 months, then deleted.
- **Sub-processors**: Vercel (hosting, DB), Twilio (WhatsApp), Telegram.
- **User rights**: access, correction, deletion, withdraw consent → email
  `privacy@belowop.ae`.
- **Children**: not directed at under-18s; record deleted on request.

Deletion path (operator runbook):
```sql
DELETE FROM leads WHERE phone = $1;
DELETE FROM subscriptions WHERE contact = $1;
-- Confirm in audit log; reply to subject confirming deletion within 30 days.
```

## 3. Rate limits

| Action | Limit | Window | Enforcement |
|---|---|---|---|
| Inquiry submission per phone | 3 | 24h | KV primary; Postgres `COUNT(*)` fallback in prod (`countRecentLeadsByPhone`) |
| Alerts per recipient | 5 / day, 1 per 30 min | 24h / 30min | `lib/kv.ts` (CLAUDE §7.7) |
| Admin login attempts | TODO | TODO | Add IP-keyed limiter before launch |

The lead limiter **fails closed** if KV is absent AND the DB count throws —
the route returns 503 rather than letting the request through.

## 4. Security CI guardrails

`.github/workflows/ci.yml` runs on every PR and main push:

1. `npm ci`
2. `npx tsc --noEmit` — type errors block merge.
3. `npm test` — parser tests.
4. `npm run test:hmac` — webhook signature verification (12 cases:
   valid, forged, length-mismatch, missing header, missing secret).
5. `bash scripts/check-no-pf-refs.sh` — enforces CLAUDE §8.6
   (no PropertyFinder references on the public surface).

Run any of these locally: `npm run check:pf`, `npm run test:hmac`.

## 5. Incident response

### Rotating tokens

All tokens live in Vercel env vars. To rotate:

```
# 1. Generate new secret
openssl rand -hex 32

# 2. Update on Vercel (Settings → Environment Variables → edit)
#    - Apply to Production + Preview + Development as appropriate
#    - Redeploy to activate

# 3. For ADMIN_TOKEN: existing admin sessions invalidate automatically
#    because the cookie value no longer matches.
# 4. For APIFY_WEBHOOK_SECRET: update the secret in the Apify actor's
#    integration settings in the same change window so the next run signs
#    with the new key.
# 5. For CRON_SECRET: Vercel rotates the cron header on next deploy.
```

### Disabling the scraper

Apify dashboard → Actor → Disable schedule. Or revoke
`APIFY_WEBHOOK_SECRET` on Vercel — incoming requests will start failing
HMAC verification (logged but never written to DB).

### Wiping data

```sql
-- Wipe a single subject (PDPL deletion request):
DELETE FROM leads WHERE phone = $1 OR ip_hash = $2;
DELETE FROM subscriptions WHERE contact = $1;

-- Wipe all leads (e.g. test data before launch):
TRUNCATE leads RESTART IDENTITY CASCADE;

-- Wipe all listings + derived data:
TRUNCATE listings, price_history, alert_events RESTART IDENTITY CASCADE;
```

Blob storage: `vercel blob ls` and `vercel blob rm <url>` for any
orphaned images.

### Observability

- Server errors: `console.error` lines surface in Vercel function logs
  (filter by route).
- HMAC failures on `/api/webhooks/apify` log
  `[webhook] signature mismatch` — alert if you see repeated mismatches
  from a single IP.
- Lead-rate-limit hits log nothing today by design (low value, high
  noise). Add a Sentry hook before launch if traffic warrants.

## 6. Known gaps (track before public launch)

- Admin login is shared-token, not magic-link (S-10 §1). Replace with
  Resend-backed magic-link auth before public launch.
- No CSP / HSTS headers yet — add in `next.config.js` (out of scope here;
  flagged to frontend track).
- No automated dependency-vuln scan in CI — add `npm audit --audit-level=high`
  step or Dependabot.
- Admin login attempts not yet rate-limited.
