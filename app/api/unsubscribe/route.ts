import { NextResponse } from 'next/server';
import { unsubscribe, unsubscribeBySubscriptionId, isDbConfigured } from '@/lib/db';
import { verifyUnsubToken } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/', req.url));
  if (!isDbConfigured()) return NextResponse.redirect(new URL('/', req.url));

  // Signed tokens are `base64url(payload).sig` — they always contain a dot.
  // Legacy links carried the raw confirm_token (base64url, no dot).
  if (token.includes('.')) {
    const verified = verifyUnsubToken(token);
    if (verified.ok) {
      await unsubscribe_safe(() => unsubscribeBySubscriptionId(verified.sid));
      return htmlResponse(unsubscribePage);
    }
    // Bad signature / expired / malformed: don't claim success.
    return htmlResponse(expiredPage);
  }

  // Legacy raw confirm_token path (plain equality). Kept so any pre-existing
  // link doesn't 500; new links are always signed.
  await unsubscribe_safe(() => unsubscribe(token));
  return htmlResponse(unsubscribePage);
}

async function unsubscribe_safe(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    // Never surface internals to the unsubscriber; log and show the friendly
    // page regardless (unsubscribing is idempotent and always desirable).
    console.error('[unsubscribe] failed', e);
  }
}

function htmlResponse(body: string): NextResponse {
  return new NextResponse(body, { headers: { 'content-type': 'text/html' } });
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

const expiredPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Link expired · Below OP</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px/1.6 -apple-system,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#0f172a;text-align:center}</style>
</head><body>
<p style="font-size:48px">⏳</p>
<h1 style="font-size:24px;margin:0">This link has expired.</h1>
<p style="color:#64748b">Unsubscribe links are valid for a limited time and can only be used once. To stop alerts, reply STOP to any message or manage your preferences below.</p>
<p><a href="/alerts" style="color:#0f766e;font-weight:600">Manage alert preferences</a></p>
</body></html>`;
