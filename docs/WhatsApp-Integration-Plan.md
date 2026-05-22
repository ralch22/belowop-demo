# Below OP — WhatsApp Integration Plan (Final)

**For:** Rami / Jad
**Updated:** 2026-05-22
**Replaces:** docs/BelowOP-Twilio-Setup.pdf (Twilio path retired)
**Supersedes guidance in:** docs/GHL-vs-Twilio.md

---

## The pivot

Jad's WhatsApp Business setup screenshots confirm the optimal path is **Meta Cloud API directly** — not Twilio, not GHL, not any BSP. Here's why and what we do next.

---

## 1 · What Jad already has (confirmed from PDF evidence)

| Asset | Status |
|---|---|
| WABA: **Distress Deals Dubai** | ✅ Approved |
| WABA ID | `1497926618655749` |
| Owning Meta Business | "Jad Sells Dubai Business" |
| Meta Business verification | ✅ Verified |
| Marketing messages | ✅ Enabled |
| Production phone: **+1 555-976-4984** ("Dubai Property Deals") | ✅ Connected · Default · Green quality |
| Secondary phone: +971 58 523 2288 ("Jad") | 🟡 In Review |
| Existing approved templates | 16 active (Marketing, English) — all reconnect/community-join campaigns |
| Display name | Dubai Property Deals (Approved) |
| WhatsApp Community link | `https://chat.whatsapp.com/F262UdXynPb2L2Y7r6OYU?mode=gi_t` |

**Translation:** every Meta-side prerequisite is already done. No verification queue. No business approval queue. The only gating item is **one new template approval** for our parameterized below-OP alert.

---

## 2 · Why Meta Cloud API direct (vs Twilio / GHL / 360dialog)

| | Meta direct (our pick) | Twilio | GHL Workflow | 360dialog BSP |
|---|---|---|---|---|
| Provider markup | **$0** | +$0.005/msg | +$10/mo/location | +variable |
| Setup days remaining | **0** (everything done) | 1–3 (new WABA) | 0 (if WABA on GHL) | 1–2 (port WABA) |
| Code complexity | Plain `fetch` | Twilio SDK + Content SIDs | Webhook POST | Same as Meta direct |
| Vendor lock-in | **None** (canonical Meta API) | High (Twilio Content) | High (GHL contacts) | Low |
| Buyer reply handling | We build (~2h) | Twilio webhook | Free (in GHL Inbox) | We build |
| Best fit when… | WABA already approved | Greenfield | Already on GHL | Multi-tenant scale |

**Jad's WABA being already approved and connected to a number with Green quality rating is the killer fact.** Going through any abstraction layer means losing money to markup for no benefit.

---

## 3 · The template constraint (and how we beat it)

You flagged the key risk: *"having each alert be a template will take time — most approvals happen in 30 min but sometimes stuck for hours."*

**We don't need per-listing templates.** Two patterns, used together:

### Pattern A — One parameterized template, approved once, reused forever

We submit **one** template — call it `below_op_alert` — with placeholders for everything that varies per listing. Approved once. Sent thousands of times. We only ever resubmit if we change *structure* (e.g. add an 8th variable), not content.

**Proposed template spec:**

```
Name:           below_op_alert
Category:       Marketing
Language:       English (en)
Header:         Image (dynamic per send — listing hero)
Body (240 chars approx, well under 1024):
─────────────────────────────────────────
🔴 DISTRESS DEAL - Below OP 🔴

📍 {{1}}

{{2}}

Handover: {{3}}
Developer: {{4}}

Selling Price: {{5}} 🔥
📉 {{6}} below OP (was {{7}})

For serious inquiries:
wa.me/15559764984
─────────────────────────────────────────
Footer (optional): "Reply STOP to unsubscribe."
Buttons:
  1. CTA — Trackable Website: "View Listing"
     URL: https://belowop-demo.vercel.app/?u={{1}}
  2. Quick Reply: "More like this"
```

**Variable map (what our backend fills per send):**

| Slot | Source | Example |
|---|---|---|
| `{{1}}` | Project + Area | `Marina Bay Tower, Dubai Marina` |
| `{{2}}` | Bullet block (type · beds · size m² · features) | `• 2BR Apartment\n• 1,250 sqft / 116 sqm\n• Sea view, Balcony` |
| `{{3}}` | Handover | `Q3 2028` |
| `{{4}}` | Developer | `EMAAR` |
| `{{5}}` | Price (formatted) | `3.2M AED \| $872K` |
| `{{6}}` | Drop % | `14%` |
| `{{7}}` | Original price (formatted) | `3.7M AED` |
| URL button param | Opaque listing ID | `u-a4f29c` |

**Why 7 vars, not more:** Meta enforces a max of 10 named parameters per body, and rejects templates that look too template-y (variables back-to-back). The bullet block packs multiple sub-fields into one slot, dodging that.

### Pattern B — The 24-hour customer service window

Meta's pricing model gives us a free pass for 24 hours after the buyer messages us. Within that window we can send **unlimited free-form rich messages** — any text, any image, any formatting — **no template required, no approval, no per-conversation fee**.

**How we exploit it:**

1. User opts in via `/alerts` → we generate a `wa.me/15559764984?text=START%20BelowOP` deep link
2. They tap it on phone → opens WhatsApp pre-filled → they hit send
3. Meta delivers their `START BelowOP` to our number → our inbound webhook fires
4. We mark `subscriber.last_inbound_at = now()` in Postgres
5. For the next 24 hours, all alerts for that subscriber go via **free-form** (cheaper, faster, richer formatting, no template)
6. After 24h or on a fresh subscriber → we send the `below_op_alert` **template** (which both delivers the content and re-opens the window for 24h more)
7. In the alert body, "Reply YES to keep receiving" → each reply auto-resets the 24h window

**Net effect:** for active users who interact even once a week, ~95% of alerts are sent free-form. Templates only fire for cold re-engagement.

---

## 4 · Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Below OP backend                           │
│                                                                    │
│   /api/cron/dispatch    /api/leads          /api/webhooks/        │
│         │                    │              whatsapp/inbound      │
│         │                    │                    │               │
│         └────────┬───────────┘                    │               │
│                  ▼                                ▼               │
│         ┌──────────────────┐         ┌──────────────────────┐    │
│         │  lib/whatsapp.ts │         │ updateLastInboundAt()│    │
│         │                  │         │ resets 24h window     │    │
│         │ sendBelowOp(     │         └──────────────────────┘    │
│         │   subscriber,    │                                      │
│         │   listing) {     │                                      │
│         │   inWindow?      │                                      │
│         │   ├ YES: freeForm│                                      │
│         │   └ NO:  template│                                      │
│         │ }                │                                      │
│         └────────┬─────────┘                                      │
└──────────────────┼────────────────────────────────────────────────┘
                   ▼
       POST graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages
       Authorization: Bearer {SYSTEM_USER_TOKEN}
                   │
                   ▼
            Meta Cloud API
                   │
                   ▼
       Subscriber's WhatsApp (+1 555-976-4984 as sender)
```

**Free-form payload (within 24h window):**
```json
{
  "messaging_product": "whatsapp",
  "to": "971501234567",
  "type": "image",
  "image": {
    "link": "https://belowop-demo.vercel.app/api/og?u=u-a4f29c",
    "caption": "🔴 DISTRESS DEAL - Below OP 🔴\n\n📍 Marina Bay Tower, Dubai Marina\n\n• 2BR Apartment\n• 116 sqm\n• Sea view\n\nHandover: Q3 2028\nDeveloper: EMAAR\n\nSelling Price: 3.2M AED 🔥\n📉 14% below OP (was 3.7M AED)"
  }
}
```

**Template payload (cold start / window expired):**
```json
{
  "messaging_product": "whatsapp",
  "to": "971501234567",
  "type": "template",
  "template": {
    "name": "below_op_alert",
    "language": { "code": "en" },
    "components": [
      { "type": "header", "parameters": [{ "type": "image", "image": { "link": "https://belowop-demo.vercel.app/api/og?u=u-a4f29c" } }]},
      { "type": "body", "parameters": [
        { "type": "text", "text": "Marina Bay Tower, Dubai Marina" },
        { "type": "text", "text": "• 2BR Apartment\n• 116 sqm\n• Sea view" },
        { "type": "text", "text": "Q3 2028" },
        { "type": "text", "text": "EMAAR" },
        { "type": "text", "text": "3.2M AED" },
        { "type": "text", "text": "14%" },
        { "type": "text", "text": "3.7M AED" }
      ]},
      { "type": "button", "sub_type": "url", "index": "0", "parameters": [{ "type": "text", "text": "u-a4f29c" }]}
    ]
  }
}
```

---

## 5 · What we need from Jad to ship

**Just three things, all from his Meta Business Manager:**

1. **PHONE_NUMBER_ID** for +1 555-976-4984
   - Path: business.facebook.com → Distress Deals Dubai → WhatsApp Manager → Numbers → click +1 555-976-4984 → "Phone number ID"
   - Looks like: `123456789012345`

2. **Permanent System User access token** with scopes:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - Path: business.facebook.com → Settings → Users → System users → Create system user "BelowOP Server" → Add asset (WABA Distress Deals Dubai) → Generate token (Never expires)

3. **Approval of one new template:** `below_op_alert` (full spec in §3 above)
   - Path: WhatsApp Manager → Templates → Create Template → paste the spec
   - Typical approval: 30 min – few hours
   - Once approved, no further approvals needed unless we change the structure

**That's it.** No DNS, no Twilio account, no GHL setup, no template-per-listing churn.

---

## 6 · Implementation plan (our side, ~3–4 hours)

### Files to add / modify

| File | Change |
|---|---|
| `lib/whatsapp.ts` | New — `sendFreeForm()`, `sendTemplate()`, `sendBelowOp()` dispatcher with 24h-window check |
| `app/api/webhooks/whatsapp/inbound/route.ts` | New — handles Meta verification challenge + inbound message events; updates `subscriber.last_inbound_at` |
| `lib/db.ts` | Add `last_inbound_at` to subscribers table (migration `0003_whatsapp_window.sql`) |
| `app/api/cron/dispatch/route.ts` | Wire to call `sendBelowOp()` instead of the Twilio stub |
| `app/api/leads/route.ts` | Wire Rami-notification to call `sendFreeForm()` (always in-window since Rami is sender) |
| `app/alerts/page.tsx` | Add `wa.me/15559764984?text=START%20BelowOP` deep link to open the 24h window |
| `.env.local` (Vercel) | Add `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_TOKEN`, `META_WHATSAPP_WABA_ID`, `META_WHATSAPP_VERIFY_TOKEN` |

### Adapter skeleton (~80 lines)

```typescript
// lib/whatsapp.ts
const BASE = `https://graph.facebook.com/v22.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;

async function postToMeta(body: object) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  if (!res.ok) throw new Error(`Meta WhatsApp ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sendFreeForm(to: string, caption: string, imageUrl: string) {
  return postToMeta({ to, type: 'image', image: { link: imageUrl, caption } });
}

export async function sendBelowOpTemplate(to: string, vars: TemplateVars) {
  return postToMeta({
    to,
    type: 'template',
    template: {
      name: 'below_op_alert',
      language: { code: 'en' },
      components: [
        { type: 'header', parameters: [{ type: 'image', image: { link: vars.heroUrl } }]},
        { type: 'body', parameters: [
          { type: 'text', text: vars.projectArea },
          { type: 'text', text: vars.bulletBlock },
          { type: 'text', text: vars.handover },
          { type: 'text', text: vars.developer },
          { type: 'text', text: vars.price },
          { type: 'text', text: vars.dropPct },
          { type: 'text', text: vars.originalPrice },
        ]},
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: vars.listingId }]},
      ],
    },
  });
}

export async function sendBelowOp(subscriber: Subscriber, listing: Listing) {
  const within24h = subscriber.last_inbound_at &&
    Date.now() - new Date(subscriber.last_inbound_at).getTime() < 24 * 60 * 60 * 1000;
  if (within24h) {
    return sendFreeForm(subscriber.phone, formatCaption(listing), heroUrl(listing));
  }
  return sendBelowOpTemplate(subscriber.phone, mapListingToVars(listing));
}
```

### Inbound webhook (~40 lines)

```typescript
// app/api/webhooks/whatsapp/inbound/route.ts
export async function GET(req: Request) {
  // Meta's verification handshake
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.verify_token') === process.env.META_WHATSAPP_VERIFY_TOKEN) {
    return new Response(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new Response('forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const payload = await req.json();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        await sql`
          UPDATE subscribers SET last_inbound_at = NOW()
          WHERE phone = ${msg.from}
        `;
        // Optional: STOP handling, lead capture from text, etc.
      }
    }
  }
  return new Response('ok', { status: 200 });
}
```

The webhook URL we give Jad to paste into Meta WhatsApp Manager → Webhooks: `https://belowop-demo.vercel.app/api/webhooks/whatsapp/inbound`

### Migration

```sql
-- migrations/0003_whatsapp_window.sql
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_subscribers_last_inbound ON subscribers(last_inbound_at);
```

---

## 7 · Acceptance checklist (when it's truly live)

- [ ] Jad submits `below_op_alert` template → Approved by Meta
- [ ] Jad shares PHONE_NUMBER_ID + permanent token + WABA_ID
- [ ] Vercel env vars set (4 vars)
- [ ] Migration `0003_whatsapp_window.sql` applied
- [ ] `lib/whatsapp.ts` + tests merged
- [ ] `/api/webhooks/whatsapp/inbound` URL pasted into Meta WhatsApp Manager → Webhooks → Verified ✓
- [ ] Test 1: cold subscriber receives template alert with hero image
- [ ] Test 2: subscriber replies anything → next alert sent free-form
- [ ] Test 3: lead form submission → Rami receives free-form WhatsApp DM
- [ ] Cron schedule alerts ≤ 5 min from listing ingestion
- [ ] CLIENT_TEST.md updated to "Twilio retired; Meta direct live"
- [ ] docs/BelowOP-Twilio-Setup.pdf → archived (kept for record, not retired since the work pivoted)

---

## 8 · Cost projection (revised vs prior estimates)

At v1 scale (200 alerts/day × 30 days = 6,000 conversations/mo):

| Provider markup layer | Markup | Meta passthrough | Total/mo |
|---|---|---|---|
| Twilio | +$30 | $378 | $408 |
| GHL | +$10 | $378 | $388 |
| **Meta direct (our pick)** | **$0** | **$378** | **$378** |

But the free-form 24h window lets us escape Meta marketing pricing for most sends:

| Scenario | Marketing conv (Meta $0.063/UAE) | Service conv (Meta $0) | Est. monthly |
|---|---|---|---|
| All template (no window optimization) | 6,000 | 0 | $378 |
| Realistic: 70% of users active within 24h | 1,800 | 4,200 | **$113** |
| Engaged community (90% active) | 600 | 5,400 | **$38** |

**Meta direct + 24h window optimization could land us under $50/month at full v1 scale.** That's the real prize.

---

## 9 · Sources

- [Meta WhatsApp Cloud API — Send Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/)
- [Meta WhatsApp Cloud API — Templates](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates)
- [Meta WhatsApp — Conversation-based pricing](https://developers.facebook.com/docs/whatsapp/pricing/)
- [Meta WhatsApp — Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Meta WhatsApp — System User permanent tokens](https://developers.facebook.com/docs/whatsapp/business-management-api/get-started)
