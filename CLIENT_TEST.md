# Below OP — Client Test Plan

**For:** Jad ALCHEIKH
**From:** Rami · Emerge Digital
**Demo:** https://belowop-demo.vercel.app
**Updated:** 2026-05-21

---

## 1 · What you're looking at

A working Progressive Web App that surfaces below-OP Dubai inventory as a filterable table and pushes alerts to WhatsApp + Telegram when new units or price drops appear. Everything you see is the production codebase running on real infrastructure (Vercel + Neon Postgres + Vercel Blob + Apify scraper).

**Two important things:**
- Already live with **5 real PropertyFinder listings** ingested via the production scraper, plus **30 seeded demo listings** for variety.
- The **alert template now matches your existing broker post format exactly** (the one in `Variables.pdf` you sent through).

Round 2 of feedback from you drives the next sprint. Round 1 changes from your last review (table columns, no unit numbers, sqm) are all live.

---

## 2 · 5-minute test on your phone

Open **https://belowop-demo.vercel.app** on iPhone or Android.

1. **Install as an app** — Share → "Add to Home Screen". App launches standalone, looks native.
2. **Scroll the listing table** — you'll see ~35 units (5 real + 30 demo). Cards on mobile, table on desktop.
3. **Tap a row** — opens an in-place modal asking for name + WhatsApp. The URL updates to `?inquire=u-xxxxxx` so it's shareable.
4. **Submit a test inquiry** — your name + a UAE number + tick consent. It will write to the database (you can verify on `/admin`).
5. **Open `/alerts`** — choose channels, areas, price range, min drop %. This is the public subscribe form for buyers.

---

## 3 · 15-minute full test on desktop

| # | What | Where | What to check |
|---|---|---|---|
| 1 | Browse listings | `/` | Table layout, columns, sort by AED/m², filter by developer/area/drop% |
| 2 | Inspect one unit | Click any row → modal | Fields shown (unit type, bathrooms, handover, features), CTA wording |
| 3 | Try filters | Top of `/` | Area, developer, beds, max price, min drop %. URL updates on each change — links are shareable. |
| 4 | Alerts opt-in | `/alerts` | Channel selection, area chips, double opt-in flow |
| 5 | Alert message preview | `/alert-preview` | The exact WhatsApp + Telegram message that fires when a new below-OP unit is detected |
| 6 | About page | `/about` | Broker disclosure section (RERA placeholder), contact lines |
| 7 | 404 page | `/anything-bad` | Custom 404 with bounce-back CTAs |

**For the alert template specifically** — open `/alert-preview` and confirm it matches what you send today via WhatsApp/Telegram. The layout follows your `Variables.pdf` exactly:

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

Please react to each of these — short answers are fine:

### Public listing page

- **Columns:** Image · Project (+ Developer · Listed) · Area · Beds · Size m² · Price · AED/m² · Δ vs OP · CTA. Anything to add/remove?
- **Filters:** Type · Beds · Area · Developer · Min drop % · Max price · Sort. What's missing — handover year? size range? furnishing?
- **Mobile cards** — content right? Or do you want different fields shown on a smaller card?

### Alert format

- Matches your `Variables.pdf` template — anything else broker-standard we should add (Plot size? BUA? View? Sub-location)?
- Direct WhatsApp CTA + web link both shown. Do you want the web link removed, or kept?

### Lead capture modal

- Fields: Name, WhatsApp, message, consent. Want to add anything (budget? timeline?)?
- Tone of "Request details" + "We'll WhatsApp you back within the hour." OK?

### Anything I haven't asked

- Things you'd send to PropertyFinder + Bayut + Dubizzle searchers that this product doesn't yet cover?
- Buyer personas — does the experience speak to investors? End-users? Both?
- Are there any RERA / compliance details you want surfaced more prominently?

---

## 5 · What's real vs what's demo

| | Status |
|---|---|
| Live Apify scraper feeding real PropertyFinder data | ✅ Real |
| Vercel Postgres database persisting listings + leads + alerts | ✅ Real |
| Image rehosting to our own CDN (Vercel Blob) | ✅ Real — 20 images already transcoded to WebP |
| WhatsApp lead notifications to Rami | ⏳ Code is wired (Twilio API). **Account credentials not connected yet** — adding takes ~30 min once a Twilio account is set up. WhatsApp templates need 24-48h Meta approval. |
| Telegram broadcast channel | ⏳ Code is wired. Bot + channel need to be created (5 min via @BotFather). |
| Public alert subscriptions | ⏳ Form + database + double opt-in fully wired. Same Twilio/Telegram dependency above. |
| RERA broker disclosure | ⏳ Placeholder — fill in once registration is confirmed. |

So: **buyers can already see live PropertyFinder below-OP units and submit inquiries** that hit our database. The only piece in flight is the outbound WhatsApp/Telegram delivery, which is a function of getting the broker accounts hooked up — not engineering work.

---

## 6 · Staged roadmap once you sign off

| Sprint | What ships |
|---|---|
| 1 — this week | Twilio sandbox + Telegram bot connected. Lead alerts route to your phone in real time. |
| 2 | Meta WhatsApp template approval for the alert template. Live broadcast to subscribers. |
| 3 | Apify scraper schedule (every 30 min, full coverage of both PropertyFinder search URLs). |
| 4 | Public site SEO + marketing launch. |
| 5 | Multi-portal expansion — add Bayut + Dubizzle scrapers. |
| 6 | Web push notifications, premium tier subscriptions, broker dashboard for managing inventory. |

---

## 7 · How to give feedback

Easiest: **WhatsApp Rami** with whatever comments while you're testing — screenshots welcome.

You can also leave inline notes by replying to this doc, or open `/admin/preview` to view any specific listing's alert and screenshot directly from there.

---

*Built with the BelowOP-Handoff spec (CLAUDE.md, PWA_PRD.docx, SRS.docx, Solution_Architecture.pdf, Screens.md, UI.md, Variables.pdf).*
