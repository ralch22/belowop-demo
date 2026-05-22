/**
 * Admin auth — token-gated for now (single shared `ADMIN_TOKEN` env var).
 *
 * The spec calls for magic-link email auth (S-10 §1). That replaces this
 * once Resend is wired up. For the demo, a shared token gets Rami
 * a working dashboard immediately.
 *
 * Flow:
 *   - /admin/login submits the token via POST
 *   - Server compares with timingSafeEqual; on match sets an HttpOnly cookie
 *   - /admin reads the cookie; on match, renders the dashboard
 */
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'belowop_admin';

function tokenOK(provided: string): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function checkLogin(token: string): boolean {
  return tokenOK(token);
}

export function isAdmin(): boolean {
  if (!process.env.ADMIN_TOKEN) return false; // refuse unless explicitly configured
  const c = cookies().get(COOKIE_NAME)?.value;
  if (!c) return false;
  return tokenOK(c);
}
