/**
 * Wrapper around @vercel/kv with a no-op fallback when KV isn't configured,
 * so the rest of the app keeps working until you install the Upstash
 * integration on Vercel. All rate-limit checks return "allowed" in fallback
 * mode and a console.log so you can see what would have been throttled.
 */

import { kv } from '@vercel/kv';

const HAS_KV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export function isKvConfigured(): boolean {
  return HAS_KV;
}

/** Atomic incr with TTL on first set. Returns the new count. */
async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  if (!HAS_KV) return 1;
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, ttlSeconds);
  return n;
}

/** Rate-limit: max `limit` actions per `windowSeconds` for a given key. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; count: number }> {
  if (!HAS_KV) {
    console.log(`[kv · stub] rateLimit ${key} (would gate at ${limit} / ${windowSeconds}s)`);
    return { allowed: true, remaining: limit, count: 0 };
  }
  const count = await incrWithTtl(key, windowSeconds);
  const allowed = count <= limit;
  return { allowed, remaining: Math.max(0, limit - count), count };
}

/** Dedup helper: returns true the first time a key is seen within TTL. */
export async function firstSeen(key: string, ttlSeconds: number): Promise<boolean> {
  if (!HAS_KV) return true;
  const ok = await kv.set(key, '1', { nx: true, ex: ttlSeconds });
  return ok === 'OK';
}
