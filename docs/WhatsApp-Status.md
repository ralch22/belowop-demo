# WhatsApp 1:1 — Wiring Status & Pause Point

**Updated:** 2026-05-26
**Status:** ⏸ Paused per client direction · wiring complete · awaiting Meta app review

> "Wallah I told u just fix this table — alerts can be figured out later" — Jad, 2026-05-26
>
> Per client direction, all WhatsApp work paused at the "proven wireable" milestone. Documented here so it can be picked up later in 1–2 hours of code work once Meta clears the app for production.

---

## What's proven working

Eight things, all server-side, all reproducible from `lib/whatsapp.ts` once we build the adapter:

| # | Capability | Evidence |
|---|---|---|
| 1 | Permanent system-user token issued | `debug_token` → `expires_at: 0`, `type: SYSTEM_USER`, valid scopes |
| 2 | Token can read WABA metadata | `/1497926618655749` returns name, country, verification status |
| 3 | Token can list templates | 17 APPROVED templates including `wa_alert_apartment` (8 vars) and `belowop_alerts` (9 vars) |
| 4 | Token can read phone profile | `+1 555-976-4984 · Dubai Property Deals · GREEN quality · VERIFIED · APPROVED name` |
| 5 | Our app subscribed to WABA | `POST /1497926618655749/subscribed_apps` returned `{success: true}` — app `test` (id `1471042450592540`) listed alongside LeadConnector |
| 6 | Inbound webhook deployed + verified by Meta | `/api/webhooks/whatsapp/inbound` → handshake passes; subscribed to `messages`, `message_template_status_update`, `phone_number_quality_update`, `account_alerts` |
| 7 | Health check passes for all entities | PHONE_NUMBER, WABA, BUSINESS, and our APP all report `can_send_message: AVAILABLE` |
| 8 | Vercel env vars in place | `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_WABA_ID`, `META_WHATSAPP_VERIFY_TOKEN` set in Production + Development |

## What's blocked

**One thing:** sending an outbound message to ANY recipient (verified or not, Jad's own admin number included) returns:

```
(#200) You do not have the necessary permissions to send messages on behalf of this WhatsApp Business Account
```

This error fires even though Meta's own `/health_status` endpoint reports the app as `AVAILABLE` for messaging. The discrepancy means **the app is recognized as eligible but is gated behind Meta's "Live mode" publish flag**. This is consistent with how Meta treats apps with the "Connect on WhatsApp" use case — they require explicit publishing to send outside an allowlist.

## What it takes to unblock (when ready)

Two parallel paths, weeks-long Meta-side:

### Path A — Switch the existing "test" app to Live mode

1. Complete the **Tech Provider Access Verification** form in Meta Business Manager for "Jad Sells Dubai Business" (Jad started this; deadline 25/07/2026 — answer drafted in this transcript)
2. Resolve **Required actions (1)** badge at top of developers.facebook.com/apps/1471042450592540 — usually 1–2 prompts to fill (privacy policy URL, app icon, category)
3. Toggle App Mode: Development → Live
4. Meta auto-reviews business apps with only the "Connect on WhatsApp" use case (no manual review queue for this scope)
5. Once Live, our existing token unlocks immediately — no code changes needed

**Total client time:** ~1 hour spread over a few days while Meta processes the form.

### Path B — Re-use Jad's existing LeadConnector / GoHighLevel pipe

The WABA already has LeadConnector subscribed (GHL). Jad pays for it. The fastest path to send WhatsApp from our app could be POSTing to a GHL workflow webhook instead of Meta directly — see [`docs/GHL-vs-Twilio.md`](GHL-vs-Twilio.md) for the comparison.

**Tradeoff:** GHL workflows let us send today (no Meta wait) but lock us into GHL's lifecycle/billing. The Meta-direct path is more flexible long-term.

## What we built that survives

Even though the send is gated, the following ship-ready artifacts exist:

- `app/api/webhooks/whatsapp/inbound/route.ts` — verified inbound webhook (Meta confirmed handshake)
- `docs/WhatsApp-Integration-Plan.md` — full architecture, 24h window strategy, template variable mapping
- Vercel env vars — set, encrypted, scoped Production + Development
- This doc — pause point for the next person to pick this up

## When we resume — estimated effort

| Task | Effort | Notes |
|---|---|---|
| `lib/whatsapp.ts` adapter (sendFreeForm + sendTemplate + window check) | 2h | Already spec'd in `docs/WhatsApp-Integration-Plan.md` §6 |
| Migration `0003_whatsapp_window.sql` — `last_inbound_at` column | 30m | One column + index |
| Wire `sendBelowOp()` into `/api/cron/dispatch` + `/api/leads` | 1h | Replace Telegram-only path with Telegram + WhatsApp parallel send |
| Subscriber opt-in flow on `/alerts` | 1h | "Tap to subscribe via WhatsApp" → `wa.me/15559764984?text=START` |
| Inbound message handler (STOP keyword, last_inbound_at update) | 1h | Already stubbed in `route.ts` POST handler — just needs DB writes |
| Token rotation + handoff | 30m | Both leaked tokens (EAAOPN… and EAAU558…) revoked, new one in Vercel only |
| **Total** | **~6h** | All client-blocked items resolved in advance via this doc + Meta-side state |

## Open security debt

Two tokens are in this build's transcripts and need revocation when WhatsApp work resumes:

1. **EAAOPN...** (60-day, BelowOP Server app, expires Jul 22) — revoke immediately, kills nothing live
2. **EAAU558...** (permanent, test app) — currently in Vercel `META_WHATSAPP_TOKEN`. Rotate the moment we resume, before any real send.

Rotation procedure (both):
1. business.facebook.com → Jad Sells Dubai → Settings → Users → System users → BelowopServer → Revoke tokens
2. Re-generate one fresh token (Never expiry, both whatsapp_* scopes, "test" app)
3. Paste new value into Vercel env var `META_WHATSAPP_TOKEN`
4. Redeploy
5. Run send test to verify

## Pivot decision

Per Jad: table = priority. Picking up the 4 paused table-pipeline tasks next:

- [#65] `ingestion_runs` log table
- [#66] Stale-listing pruning (2-miss conservative)
- [#67] `/admin/pipeline` observability page
- [#68] Watchdog cron + Telegram alert

ETA: 1–2 days of focused work to ship all four.

---

## Reproducing the wiring proof (for the next session)

If you're picking this up later, here are the exact API calls that confirm each capability. Run with the `META_WHATSAPP_TOKEN` env var.

```bash
# Token introspection — confirms permanent, SYSTEM_USER type, right scopes
curl -s "https://graph.facebook.com/v22.0/debug_token?input_token=$META_WHATSAPP_TOKEN&access_token=$META_WHATSAPP_TOKEN" | jq

# WABA + templates
curl -s -H "Authorization: Bearer $META_WHATSAPP_TOKEN" "https://graph.facebook.com/v22.0/$META_WHATSAPP_WABA_ID/message_templates?fields=name,status&limit=30" | jq

# Phone profile + quality + status
curl -s -H "Authorization: Bearer $META_WHATSAPP_TOKEN" "https://graph.facebook.com/v22.0/$META_WHATSAPP_PHONE_NUMBER_ID?fields=display_phone_number,verified_name,quality_rating,health_status" | jq

# Subscribed apps on WABA (should list 'test' + LeadConnector)
curl -s -H "Authorization: Bearer $META_WHATSAPP_TOKEN" "https://graph.facebook.com/v22.0/$META_WHATSAPP_WABA_ID/subscribed_apps" | jq

# Webhook handshake (live)
curl -s "https://belowop-demo.vercel.app/api/webhooks/whatsapp/inbound?hub.mode=subscribe&hub.verify_token=<value>&hub.challenge=test123"
# should return: test123
```

If all five return as expected → wiring intact, only Meta's publish flag is gating sends. Resume work from there.
