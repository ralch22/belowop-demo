/**
 * Real lead capture — persists to Postgres, rate-limits per phone via KV,
 * notifies the owner via WhatsApp + Telegram.
 *
 * Falls back gracefully when DB / KV / messaging aren't configured so the
 * demo keeps working while infra spins up.
 */
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import {
  fetchListingByRef,
  insertLead,
  markLeadNotified,
  isDbConfigured,
  countRecentLeadsByPhone,
} from '@/lib/db';
import { isKvConfigured, rateLimit } from '@/lib/kv';
import { notifyOwnerNewLead } from '@/lib/notify';
import { opaqueIdFromRef } from '@/lib/format';

export const dynamic = 'force-dynamic';

const LEAD_RL_LIMIT = 3;
const LEAD_RL_WINDOW_SECONDS = 60 * 60 * 24;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, phone, message, listing_ref, consent } = body ?? {};

  if (!name || !phone || !consent) {
    return NextResponse.json({ ok: false, error: 'missing required fields' }, { status: 400 });
  }

  // Rate-limit: 3 lead submissions per phone per 24h (CLAUDE.md §7.9).
  // Primary path: KV (fast, atomic). Fallback in production without KV:
  // count leads in Postgres so the privacy requirement still holds.
  const phoneKey = `lead:rl:${phone.replace(/\s+/g, '')}`;
  if (isKvConfigured()) {
    const rl = await rateLimit(phoneKey, LEAD_RL_LIMIT, LEAD_RL_WINDOW_SECONDS);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited', message: "You've reached today's limit. Try again tomorrow." },
        { status: 429 },
      );
    }
  } else if (process.env.NODE_ENV === 'production' && isDbConfigured()) {
    // KV not configured — fall back to a DB count so we still honour PDPL.
    // We open the DB up-front (would happen below anyway on insert) to gate
    // the request before any side effects.
    try {
      const recent = await countRecentLeadsByPhone(phone, 24);
      if (recent >= LEAD_RL_LIMIT) {
        return NextResponse.json(
          { ok: false, error: 'rate_limited', message: "You've reached today's limit. Try again tomorrow." },
          { status: 429 },
        );
      }
    } catch (e) {
      // If the DB count fails we DO NOT silently let the request through —
      // that would defeat the limit. Fail closed with a 503 so the client
      // can retry, and emit a log line for the on-call to investigate.
      console.error('[leads] DB-fallback rate-limit failed', e);
      return NextResponse.json(
        { ok: false, error: 'rate_limit_unavailable' },
        { status: 503 },
      );
    }
  } else {
    // Dev/staging without KV or DB: log only. Production code path above
    // always has one of KV or DB configured.
    console.log(`[leads] rate-limit bypass (no KV, NODE_ENV=${process.env.NODE_ENV})`);
  }

  // If the DB isn't configured yet, accept the lead but tell the caller we
  // logged a stub. The demo keeps working visually.
  if (!isDbConfigured()) {
    console.log('[leads · stub]', { name, phone, listing_ref });
    return NextResponse.json({ ok: true, demo: true });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ipHash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : undefined;

  try {
    const listing = listing_ref ? await fetchListingByRef(listing_ref) : null;
    const { id: leadId } = await insertLead({
      listingRef: listing_ref,
      name,
      phone,
      message,
      consent: Boolean(consent),
      ipHash,
    });

    // Surface the opaque internal id (matches what the buyer quotes on
    // WhatsApp); the raw PF ref stays in the DB/admin only.
    const notify = await notifyOwnerNewLead({
      name,
      phone,
      message,
      listingId: listing_ref ? opaqueIdFromRef(listing_ref) : '—',
      listingProject: listing?.project ?? 'Unknown unit',
      listingPrice: listing?.currentPrice ?? 0,
    });

    if (!notify.wa.ok || !notify.tg.ok) {
      await markLeadNotified(leadId, JSON.stringify(notify));
    } else {
      await markLeadNotified(leadId);
    }

    return NextResponse.json({ ok: true, leadId });
  } catch (e) {
    console.error('[leads] failed', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
