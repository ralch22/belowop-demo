/**
 * Tests for lib/tokens.ts — signed, expiring, single-use unsubscribe tokens.
 *
 * Run: npx tsx tests/tokens.test.ts
 *
 * Why these tests matter: unsubscribe used to match a raw DB string by plain
 * equality. Signed tokens replace that with a stateless, tamper-evident,
 * time-boxed credential. These tests pin the threat model:
 *   - A freshly minted token round-trips to the right subscription id.
 *   - A tampered payload or signature is rejected (forgery).
 *   - An expired token is rejected (replay window is bounded).
 *   - A missing secret denies by default (misconfigured prod admits no one).
 *   - Malformed input never throws.
 */

// Secret must be set BEFORE importing the module (it reads env at call time,
// but set early to be safe across module evaluation).
process.env.TOKEN_SIGNING_SECRET = 'test-token-secret-do-not-use-in-prod';

import { signUnsubToken, verifyUnsubToken, buildUnsubUrl } from '../lib/tokens';

// ---------- micro test framework (mirrors hmac.test.ts) ----------
type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// ---------- happy path ----------

test('signUnsubToken · round-trips to the same sid', () => {
  const tok = signUnsubToken(42)!;
  assert(typeof tok === 'string' && tok.includes('.'), 'token should be string with a dot');
  const v = verifyUnsubToken(tok);
  eq(v, { ok: true, sid: 42 });
});

test('signUnsubToken · large sid round-trips', () => {
  const tok = signUnsubToken(9007199254740991)!;
  eq(verifyUnsubToken(tok), { ok: true, sid: 9007199254740991 });
});

test('buildUnsubUrl · produces a /api/unsubscribe URL with an encoded token', () => {
  const url = buildUnsubUrl('https://belowop-demo.vercel.app', 7)!;
  assert(url.startsWith('https://belowop-demo.vercel.app/api/unsubscribe?token='), `bad url: ${url}`);
  const token = decodeURIComponent(url.split('token=')[1]);
  eq(verifyUnsubToken(token), { ok: true, sid: 7 });
});

// ---------- forgery / tampering ----------

test('verifyUnsubToken · tampered signature is rejected', () => {
  const tok = signUnsubToken(42)!;
  const [body, sig] = tok.split('.');
  const forgedSig = sig.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
  eq(verifyUnsubToken(`${body}.${forgedSig}`), { ok: false, reason: 'bad_signature' });
});

test('verifyUnsubToken · tampered payload (re-encoded sid) is rejected', () => {
  const tok = signUnsubToken(42)!;
  const sig = tok.split('.')[1];
  const forgedBody = Buffer.from(JSON.stringify({ sid: 999, exp: Math.floor(Date.now() / 1000) + 1000 }), 'utf8').toString('base64url');
  eq(verifyUnsubToken(`${forgedBody}.${sig}`), { ok: false, reason: 'bad_signature' });
});

test('verifyUnsubToken · token signed with a different secret is rejected', () => {
  const tok = signUnsubToken(42)!;
  const saved = process.env.TOKEN_SIGNING_SECRET;
  process.env.TOKEN_SIGNING_SECRET = 'a-totally-different-secret';
  const v = verifyUnsubToken(tok);
  process.env.TOKEN_SIGNING_SECRET = saved;
  eq(v, { ok: false, reason: 'bad_signature' });
});

// ---------- expiry ----------

test('verifyUnsubToken · expired token is rejected', () => {
  const tok = signUnsubToken(42, -10)!; // already expired 10s ago
  eq(verifyUnsubToken(tok), { ok: false, reason: 'expired' });
});

test('verifyUnsubToken · token expiring in the future is accepted', () => {
  const tok = signUnsubToken(42, 60)!;
  eq(verifyUnsubToken(tok), { ok: true, sid: 42 });
});

// ---------- malformed input (never throws) ----------

test('verifyUnsubToken · no dot is malformed', () => {
  eq(verifyUnsubToken('justonepart'), { ok: false, reason: 'malformed' });
});

test('verifyUnsubToken · empty string is malformed', () => {
  eq(verifyUnsubToken(''), { ok: false, reason: 'malformed' });
});

test('verifyUnsubToken · trailing-dot is malformed', () => {
  eq(verifyUnsubToken('abc.'), { ok: false, reason: 'malformed' });
});

test('verifyUnsubToken · valid signature over non-JSON body is malformed', () => {
  // Sign a body that base64url-decodes to non-JSON, so signature passes but parse fails.
  const { createHmac } = require('node:crypto');
  const body = Buffer.from('not json at all', 'utf8').toString('base64url');
  const sig = createHmac('sha256', process.env.TOKEN_SIGNING_SECRET).update(body).digest('base64url');
  eq(verifyUnsubToken(`${body}.${sig}`), { ok: false, reason: 'malformed' });
});

// ---------- default-deny when misconfigured ----------

test('verifyUnsubToken · no secret configured denies', () => {
  const tok = signUnsubToken(42)!;
  const savedT = process.env.TOKEN_SIGNING_SECRET;
  const savedA = process.env.APIFY_WEBHOOK_SECRET;
  delete process.env.TOKEN_SIGNING_SECRET;
  delete process.env.APIFY_WEBHOOK_SECRET;
  const v = verifyUnsubToken(tok);
  process.env.TOKEN_SIGNING_SECRET = savedT;
  if (savedA !== undefined) process.env.APIFY_WEBHOOK_SECRET = savedA;
  eq(v, { ok: false, reason: 'no_secret' });
});

test('signUnsubToken · returns null when no secret configured', () => {
  const savedT = process.env.TOKEN_SIGNING_SECRET;
  const savedA = process.env.APIFY_WEBHOOK_SECRET;
  delete process.env.TOKEN_SIGNING_SECRET;
  delete process.env.APIFY_WEBHOOK_SECRET;
  const tok = signUnsubToken(42);
  process.env.TOKEN_SIGNING_SECRET = savedT;
  if (savedA !== undefined) process.env.APIFY_WEBHOOK_SECRET = savedA;
  eq(tok, null);
});

// ---------- falls back to APIFY_WEBHOOK_SECRET ----------

test('tokens · fall back to APIFY_WEBHOOK_SECRET when TOKEN_SIGNING_SECRET unset', () => {
  const savedT = process.env.TOKEN_SIGNING_SECRET;
  delete process.env.TOKEN_SIGNING_SECRET;
  process.env.APIFY_WEBHOOK_SECRET = 'apify-fallback-secret';
  const tok = signUnsubToken(5)!;
  const v = verifyUnsubToken(tok);
  process.env.TOKEN_SIGNING_SECRET = savedT;
  eq(v, { ok: true, sid: 5 });
});

// ---------- runner ----------
let passed = 0, failed = 0;
const fails: { name: string; err: string }[] = [];
for (const c of cases) {
  try { c.fn(); passed++; console.log('  ✓', c.name); }
  catch (e) { failed++; fails.push({ name: c.name, err: (e as Error).message }); console.error('  ✗', c.name); }
}
console.log(`\n${passed}/${cases.length} passed${failed ? ` (${failed} failed)` : ''}`);
if (failed) {
  console.error('\nFailures:');
  for (const f of fails) console.error(` · ${f.name}\n     ${f.err}`);
  process.exit(1);
}
