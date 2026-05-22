/**
 * Admin "Run now" controls — trigger image-sync or alerts-dispatch on demand.
 *
 * Hobby tier limits crons to once a day, but ops staff need to fire these
 * manually for debugging and demos. Gated by ADMIN_TOKEN (Bearer header).
 *
 *   POST /api/admin/run?job=image-sync
 *   POST /api/admin/run?job=alerts-dispatch
 *
 * Internally these proxy to the same handlers the cron uses by setting the
 * CRON_SECRET on the internal call.
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function callCronRoute(path: string, req: Request): Promise<{ status: number; body: unknown }> {
  const base = new URL(req.url).origin;
  const cronSecret = process.env.CRON_SECRET;
  const headers: Record<string, string> = {};
  if (cronSecret) headers['authorization'] = `Bearer ${cronSecret}`;
  const resp = await fetch(`${base}${path}`, { method: 'GET', headers, cache: 'no-store' });
  const body = await resp.json().catch(() => ({}));
  return { status: resp.status, body };
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const job = new URL(req.url).searchParams.get('job');
  if (job === 'image-sync') {
    const r = await callCronRoute('/api/image-sync', req);
    return NextResponse.json({ ok: r.status === 200, job, status: r.status, result: r.body });
  }
  if (job === 'alerts-dispatch') {
    const r = await callCronRoute('/api/alerts/dispatch', req);
    return NextResponse.json({ ok: r.status === 200, job, status: r.status, result: r.body });
  }
  return NextResponse.json({ ok: false, error: 'unknown job — use image-sync or alerts-dispatch' }, { status: 400 });
}
