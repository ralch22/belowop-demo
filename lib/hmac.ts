import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify an HMAC-SHA256 signature header.
 * The Apify actor signs `Buffer.from(rawBody).toString()` with the shared
 * APIFY_WEBHOOK_SECRET and sends the hex digest in x-belowop-signature.
 */
export function verifyHmacSha256(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(header.trim(), 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
