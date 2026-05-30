import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring, single-use action tokens.
 *
 * Replaces the previous "store a random string in the DB and match by plain
 * equality" model for unsubscribe links. A token is `base64url(payload).sig`
 * where:
 *   - payload = { sid, exp } JSON (sid = subscription id, exp = unix seconds)
 *   - sig     = base64url(HMAC-SHA256(payload, secret))
 *
 * Verification is stateless (signature + expiry). Single-use is enforced at the
 * data layer: the first successful unsubscribe stamps `unsub_used_at`, so a
 * replayed token is recognised as already-consumed. See lib/db.ts
 * `unsubscribeBySubscriptionId`.
 *
 * Secret: TOKEN_SIGNING_SECRET, falling back to APIFY_WEBHOOK_SECRET (already
 * present in prod) so no new env is strictly required to ship. A dedicated
 * TOKEN_SIGNING_SECRET is recommended.
 */

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function tokenSecret(): string | null {
  return process.env.TOKEN_SIGNING_SECRET || process.env.APIFY_WEBHOOK_SECRET || null;
}

interface TokenPayload {
  sid: number;
  exp: number; // unix seconds
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * Mint a signed unsubscribe token for a subscription. Returns null when no
 * signing secret is configured (caller should fall back / skip).
 */
export function signUnsubToken(subscriptionId: number, ttlSeconds = DEFAULT_TTL_SECONDS): string | null {
  const secret = tokenSecret();
  if (!secret) return null;
  const payload: TokenPayload = {
    sid: subscriptionId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export type UnsubVerifyResult =
  | { ok: true; sid: number }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'no_secret' };

/**
 * Verify a signed unsubscribe token. Constant-time signature comparison;
 * checks structure, signature, then expiry.
 */
export function verifyUnsubToken(token: string): UnsubVerifyResult {
  const secret = tokenSecret();
  if (!secret) return { ok: false, reason: 'no_secret' };

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' };
  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(body, secret);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof payload.sid !== 'number' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, sid: payload.sid };
}

/**
 * Build a full unsubscribe URL for a subscription. Returns null when signing
 * isn't configured so callers can omit the link rather than emit a broken one.
 */
export function buildUnsubUrl(origin: string, subscriptionId: number): string | null {
  const token = signUnsubToken(subscriptionId);
  return token ? `${origin}/api/unsubscribe?token=${encodeURIComponent(token)}` : null;
}
