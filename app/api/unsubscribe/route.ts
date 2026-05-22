import { NextResponse } from 'next/server';
import { unsubscribe, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/', req.url));
  if (!isDbConfigured()) return NextResponse.redirect(new URL('/', req.url));
  await unsubscribe(token);
  return new NextResponse(unsubscribePage, { headers: { 'content-type': 'text/html' } });
}

const unsubscribePage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Unsubscribed · Below OP</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px/1.6 -apple-system,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#0f172a;text-align:center}</style>
</head><body>
<p style="font-size:48px">👋</p>
<h1 style="font-size:24px;margin:0">You've been unsubscribed.</h1>
<p style="color:#64748b">We won't message you any more.</p>
<p><a href="/" style="color:#0f766e;font-weight:600">Back to listings</a> &middot; <a href="/alerts" style="color:#0f766e;font-weight:600">Resubscribe</a></p>
</body></html>`;
