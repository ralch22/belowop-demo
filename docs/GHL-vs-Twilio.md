# GHL vs Twilio — WhatsApp Integration Decision Doc

**For:** Rami / Jad
**Updated:** 2026-05-22
**Context:** Below OP needs to send (1) below-OP listing alerts to opted-in subscribers and (2) lead notifications to Rami's phone, both via WhatsApp. Telegram is already live. This doc compares the two paths we'd take for WhatsApp.

---

## TL;DR

| | **GoHighLevel** (Workflow Webhook) | **Twilio** (WhatsApp Business API) |
|---|---|---|
| Time-to-live | **~½ day** (if WABA already connected to GHL) | ~1 day code + **24–72h Meta template approval** |
| Code we own | ~40 lines (one `fetch` call) | ~150 lines (Twilio SDK + media + retries) |
| Meta verification | **Already done** in your GHL setup | Jad needs to do it (1–3 days) |
| Template approval | **Already done** in your GHL templates | New Meta queue per template |
| Per-message cost | $10/mo/location + Meta pass-through (~$0.005–$0.07/msg) | Twilio $0.005 + Meta $0.005–$0.07/msg |
| Buyer replies | Land in Rami's GHL Inbox automatically | We build the inbound webhook + storage |
| Editable copy | Rami edits in GHL UI, no redeploy | Hardcoded in our repo, requires git push |
| Vendor lock-in | Higher (GHL-shaped contact model) | Lower (Meta API directly) |
| **Recommendation** | ✅ **Path A for v1** | Skip unless GHL unavailable |

**Bottom line:** If Rami's agency already runs on GHL with WhatsApp enabled, we wire the GHL Workflow Webhook this afternoon and the WhatsApp piece is done. Twilio remains a viable fallback if we ever outgrow GHL or want lower-level control.

---

## 1 · Architecture comparison

### GHL Path

```
┌─────────────┐    HTTPS POST     ┌────────────────────────┐
│  Below OP   │  ───────────────▶ │  GHL Workflow Webhook  │
│  (Vercel)   │   JSON payload    │  (no auth — URL is secret) │
└─────────────┘                   └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌───────────────────────────┐
                                  │  GHL Workflow executes    │
                                  │  1. Upsert contact        │
                                  │  2. Select WA template    │
                                  │  3. Fill variables        │
                                  │  4. Send via WABA         │
                                  │  5. Log in Inbox          │
                                  └───────────────────────────┘
```

We POST. GHL does everything else. Templates, retries, conversation threading, inbox UI — all theirs.

### Twilio Path

```
┌─────────────┐    Twilio REST    ┌────────────────────────┐
│  Below OP   │  ───────────────▶ │  Twilio Messages API   │
│  (Vercel)   │   Bearer + body   │  /Messages.json        │
└─────────────┘                   └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌───────────────────────────┐
                                  │  Twilio → Meta WABA       │
                                  │  Meta delivers to phone   │
                                  └───────────┬───────────────┘
                                              │
                                              ▼ (buyer reply)
                                  ┌───────────────────────────┐
                                  │  Twilio inbound webhook   │
                                  │  → /api/whatsapp/inbound  │
                                  │  → Postgres conv table    │
                                  │  → Notify Rami            │
                                  └───────────────────────────┘
```

We own everything below the line. More code, more state, more flexibility.

---

## 2 · Integration shape (actual code)

### GHL — `lib/whatsapp-ghl.ts` (~40 lines)

```typescript
// One env var: GHL_LISTING_ALERT_WEBHOOK_URL
export async function broadcastListing(payload: ListingAlert) {
  const res = await fetch(process.env.GHL_LISTING_ALERT_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: payload.id,
      projectName: payload.project,
      area: payload.area,
      price: payload.price,
      dropPct: payload.dropPct,
      heroUrl: payload.heroUrl,
      caption: payload.caption,
      // GHL workflow loops over tagged contacts itself
    }),
  });
  if (!res.ok) throw new Error(`GHL webhook ${res.status}`);
}

export async function notifyRamiOfLead(lead: Lead) {
  await fetch(process.env.GHL_LEAD_NOTIFY_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  });
}
```

Done. The "auth" is the webhook URL itself being secret (Vercel env var).

### Twilio — `lib/whatsapp-twilio.ts` (~150 lines)

```typescript
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
);

export async function sendTemplatedAlert(to: string, vars: AlertVars) {
  // Templates must be pre-approved via Twilio + Meta
  return client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WA_FROM}`,
    to: `whatsapp:${to}`,
    contentSid: process.env.TWILIO_TEMPLATE_BELOW_OP_ALERT!, // pre-approved
    contentVariables: JSON.stringify({
      '1': vars.project,
      '2': vars.area,
      '3': vars.price,
      '4': vars.dropPct,
      // ... matching template placeholder count exactly
    }),
    mediaUrl: [vars.heroUrl], // separate media; must be HTTPS, < 5MB
  });
}

export async function sendFreeFormToRami(body: string) {
  // Free-form only allowed inside 24h customer-initiated session
  return client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WA_FROM}`,
    to: `whatsapp:${process.env.RAMI_WA_NUMBER}`,
    body,
  });
}

// Plus: /api/whatsapp/inbound route, signature verification,
// status callback handler, opt-out keyword handler, conversation storage,
// 24h window tracker, error retry logic, etc.
```

Plus separate `/api/whatsapp/inbound` route, plus signature verification middleware, plus conversation table migration.

---

## 3 · Setup time breakdown

### GHL (assuming WABA already in GHL with templates approved)

| Step | Owner | Time |
|---|---|---|
| Rami builds the "New listing → broadcast" workflow in GHL UI | Rami | 30 min |
| Rami builds the "New lead → notify Rami" workflow in GHL UI | Rami | 15 min |
| Copy webhook URLs into Vercel env vars | Me | 5 min |
| Write `lib/whatsapp-ghl.ts` adapter | Me | 1 hour |
| Wire into existing dispatch + lead handler | Me | 1 hour |
| Add tests | Me | 30 min |
| End-to-end test with real WhatsApp number | Both | 30 min |
| **Total** | | **~½ day, no Meta wait** |

### Twilio (greenfield)

| Step | Owner | Time |
|---|---|---|
| Jad creates Twilio account + buys WhatsApp-capable number | Jad | 30 min |
| Jad submits Meta Business verification | Jad | 1–3 business days (Meta) |
| Jad creates `below_op_alert` template in Twilio Content Builder | Jad | 15 min |
| Meta approves template | Meta | **24–48h** |
| Jad shares SID + auth token + template SID | Jad | 5 min |
| Write `lib/whatsapp-twilio.ts` adapter + inbound route | Me | 4 hours |
| Add signature verification middleware | Me | 1 hour |
| Add conversation storage migration + queries | Me | 1 hour |
| Wire into dispatch + lead handler | Me | 1 hour |
| Status callback handler + retry logic | Me | 1 hour |
| Add tests | Me | 1 hour |
| End-to-end test | Both | 30 min |
| **Total** | | **~1 day code + 1–5 days Meta queue** |

---

## 4 · Cost comparison

Both ultimately pay Meta for conversations. The difference is the markup layer.

### GHL pricing

- **Platform fee:** $10/month per location (sub-account)
- **Meta conversation fees:** passed through at cost (varies by country + category)
  - Marketing template to UAE: ~$0.0628 per conversation (24h window)
  - Utility template to UAE: ~$0.0184
  - Service (user-initiated): ~$0
- **Volume floor:** Meta gives 1,000 free service conversations/month per WABA

Estimated monthly cost at our v1 scale (200 alerts/day × 30 days = 6k marketing conversations):
```
$10 platform fee + (6,000 × $0.063) = $10 + $378 = ~$388/month
```

### Twilio pricing

- **Platform fee:** $0 base, but **$0.005 per message** Twilio fee on top of Meta
- **Meta conversation fees:** same as above (Meta charges, not Twilio)
- **WhatsApp-capable number:** ~$1/month

Estimated monthly cost at same scale:
```
$1 number + (6,000 × ($0.005 + $0.063)) = $1 + $408 = ~$409/month
```

**Cost verdict: roughly identical at our scale.** Twilio is slightly cheaper per-message but GHL bundles the inbox/CRM/workflow tooling we'd otherwise build ourselves.

---

## 5 · Capabilities matrix

| | GHL | Twilio |
|---|---|---|
| Send WhatsApp template messages | ✅ via workflow | ✅ via Content SID |
| Send free-form text (within 24h window) | ✅ | ✅ |
| Send media with caption (our hero image) | ✅ workflow can attach | ✅ `mediaUrl` array |
| Receive inbound replies | ✅ lands in GHL Inbox | 🟡 We build inbound route |
| Conversation history | ✅ stored in GHL | 🟡 We build storage |
| Per-contact opt-out | ✅ built-in | 🟡 We build keyword handler |
| Template management UI | ✅ built-in | ✅ Twilio Content Builder |
| Dynamic variables in templates | ✅ workflow merges | ✅ `contentVariables` JSON |
| Rami edits copy without redeploy | ✅ | ❌ |
| Buyer reply triggers AI response | ✅ via GHL Conversation AI add-on ($) | 🟡 Build ourselves |
| Broadcast WhatsApp Channel posts | ❌ no API | ❌ no API |
| Programmatic contact upsert | ✅ Contacts API | n/a |
| Webhook signature verification | n/a (URL is secret) | ✅ X-Twilio-Signature |
| Status callbacks (delivered/read) | ✅ within GHL Inbox | ✅ via webhook |
| Rate limits | 100 req/10s / 200k/day per app | Tier-based, scales up by purchase |
| SOC 2 / compliance | SOC 2 Type II | SOC 2 Type II, HIPAA-eligible |

**Note on Channels:** Neither solves WhatsApp Channel broadcast posting (`@DubaiPropertydeal`). Meta has no Channels API. The 3-click `/admin/relay` flow stays the same either way.

---

## 6 · What it means for Below OP specifically

### If you choose GHL (recommended)

**Pros for our use case:**
1. Rami already lives in GHL Inbox — buyer replies show up where he expects
2. Zero new auth ceremony — webhooks are URL-as-secret, rotate by regenerating in GHL UI
3. Rami changes the alert copy in GHL UI when he wants to A/B test wording — no PR, no deploy
4. AI auto-qualify is one toggle away (GHL Conversation AI) if Rami wants to handle "is this still available?" replies automatically
5. Contacts upserted via webhook become full CRM contacts — opt-in/out, tagging, drip campaigns all available without us building anything
6. Single billing relationship (GHL handles Meta passthrough)

**Cons:**
1. Coupled to GHL availability — if GHL goes down, our queue waits
2. Cost scales with their pricing changes (out of our control)
3. If we ever want to white-label the platform for another broker, we either onboard them to GHL too or rewrite the adapter

### If you choose Twilio

**Pros:**
1. Lower-level control — exact mediaUrl handling, exact template variables, status callbacks
2. Provider-neutral — Twilio adapter swaps to Meta direct / 360dialog / Gupshup with minor changes
3. Cleaner separation of concerns (Twilio = transport, our DB = state)
4. Better for high-volume / multi-tenant future

**Cons:**
1. We rebuild Inbox / opt-out / conversation history from scratch
2. Rami has to either log into Twilio for replies or we build a custom inbox in `/admin`
3. Meta template approval queue every time copy changes
4. Two systems to debug when something breaks (Twilio + our wrapper)

---

## 7 · Switching cost (can we change our mind?)

**Yes, easily.** The full WhatsApp adapter is one file: `lib/whatsapp.ts`. Both adapters export the same `broadcastListing()` and `notifyRamiOfLead()` signatures. Swapping means:

1. Write the other adapter (~½ day for either direction)
2. Update env vars in Vercel
3. Update the import in `app/api/cron/dispatch/route.ts` and `app/api/leads/route.ts`
4. Run the test suite

**No data migration, no schema changes, no downtime.** The Telegram and `/admin/relay` flows are unaffected by which WhatsApp transport we pick.

This means: **start with GHL for speed-to-live, and if we ever need finer control or hit a GHL limitation, we swap to Twilio in an afternoon.**

---

## 8 · The recommendation

**Wire GHL Workflow Webhook for v1. Ship this week.**

**Why:**
- Fastest path to a live WhatsApp pipeline (no Meta queue if your WABA is already in GHL)
- Lowest engineering risk (40 lines vs 150)
- Rami stays in the tool he already uses for everything else
- Buyer reply handling comes for free (we'd build it from scratch with Twilio)
- Switching cost is half a day if we ever change our mind

**Keep Twilio in our pocket as the fallback option** documented at `docs/BelowOP-Twilio-Setup.pdf` — if GHL pricing ever moves the wrong way or we white-label for other brokers, we have the receipts.

---

## 9 · What I need from you to proceed (GHL path)

1. **Confirm WABA is connected** to the relevant GHL sub-account and at least one WhatsApp template is approved (template name + variable slots)
2. **Build two workflows** in GHL (or I'll write you a click-by-click setup guide):
   - "New Below-OP listing → broadcast to subscribers tagged `below-op-subscribers`"
   - "New lead → WhatsApp Rami's number directly"
3. **Send me the two webhook URLs** (Vercel env vars `GHL_LISTING_ALERT_WEBHOOK_URL` + `GHL_LEAD_NOTIFY_WEBHOOK_URL`)

Once I have those three things, the WhatsApp piece ships before EOD.

---

## Sources

- [HighLevel API Documentation (Developer Marketplace)](https://marketplace.gohighlevel.com/docs/)
- [Send a new message — Conversations API](https://marketplace.gohighlevel.com/docs/ghl/conversations/send-a-new-message/index.html)
- [GHL Conversations API — Add Inbound Message](https://help.gohighlevel.com/support/solutions/articles/155000007340-conversations-api-add-inbound-message-with-contact-id-)
- [GHL WhatsApp Workflow Integration](https://help.gohighlevel.com/support/solutions/articles/155000001624-whatsapp-workflow-integration)
- [GHL Workflow Action — WhatsApp](https://help.gohighlevel.com/support/solutions/articles/155000003531-workflow-action-whatsapp)
- [GHL WhatsApp Full Setup Guide for Agency](https://help.gohighlevel.com/support/solutions/articles/48001206216-whatsapp-full-setup-guide-for-agency)
- [GHL Interactive WhatsApp Messages](https://help.gohighlevel.com/support/solutions/articles/155000006082-interactive-whatsapp-messages)
- [Twilio WhatsApp Business API Overview](https://www.twilio.com/docs/whatsapp/api)
- [Twilio Content Templates API](https://www.twilio.com/docs/content/content-template-types)
- [Meta — WhatsApp Business Platform Conversation Pricing](https://developers.facebook.com/docs/whatsapp/pricing/)
