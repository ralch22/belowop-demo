import { NextResponse } from 'next/server';
import { activateSubscription, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/alerts', req.url));
  if (!isDbConfigured()) return NextResponse.redirect(new URL('/alerts/confirmed', req.url));

  const ok = await activateSubscription(token);
  return NextResponse.redirect(new URL(ok ? '/alerts/confirmed' : '/alerts?error=bad_token', req.url));
}
