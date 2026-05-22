import { NextResponse } from 'next/server';
import { checkLogin, COOKIE_NAME } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get('token') ?? '');
  if (!checkLogin(token)) {
    return NextResponse.redirect(new URL('/admin/login?error=bad_token', req.url));
  }
  const res = NextResponse.redirect(new URL('/admin', req.url));
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}

export async function DELETE(req: Request) {
  const res = NextResponse.redirect(new URL('/admin/login', req.url));
  res.cookies.delete(COOKIE_NAME);
  return res;
}
