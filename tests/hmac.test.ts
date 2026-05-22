/**
 * Tests for lib/hmac.ts — webhook signature verification.
 *
 * Run: npm run test:hmac
 *
 * Why these tests matter: the Apify webhook is our only trust-bridge
 * between an external scraper and our DB. A timing-safe, length-checked
 * verifier is the difference between "an attacker who knows the endpoint
 * can ingest arbitrary listings" and "they cannot".
 *
 * Threat model coverage:
 *   - Valid signature must pass (no false negatives blocking real traffic).
 *   - Wrong signature must fail (no false positives admitting forgeries).
 *   - Length mismatch must fail before timingSafeEqual (which would throw).
 *   - Missing header must fail (defaults must deny).
 *   - Missing secret must fail (misconfigured prod must not admit anyone).
 */
import { createHmac } from 'node:crypto';
import { verifyHmacSha256 } from '../lib/hmac';

// ---------- micro test framework (zero deps, mirrors description-parser.test.ts) ----------

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const SECRET = 'test-shared-secret-do-not-use-in-prod';
const BODY = JSON.stringify({ event: 'ACTOR.RUN.SUCCEEDED', resource: { id: 'abc' } });

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

// ---------- happy path ----------

test('verifyHmacSha256 · valid signature passes', () => {
  const sig = sign(BODY, SECRET);
  eq(verifyHmacSha256(BODY, sig, SECRET), true);
});

test('verifyHmacSha256 · valid signature with surrounding whitespace passes (trim)', () => {
  const sig = sign(BODY, SECRET);
  eq(verifyHmacSha256(BODY, `  ${sig}  `, SECRET), true);
});

// ---------- forged signatures ----------

test('verifyHmacSha256 · wrong signature fails', () => {
  // Same length, different bytes — forces the timingSafeEqual branch.
  const sig = sign(BODY, SECRET);
  const forged = sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));
  eq(verifyHmacSha256(BODY, forged, SECRET), false);
});

test('verifyHmacSha256 · signature from a different body fails', () => {
  const sig = sign('different-body', SECRET);
  eq(verifyHmacSha256(BODY, sig, SECRET), false);
});

test('verifyHmacSha256 · signature from a different secret fails', () => {
  const sig = sign(BODY, 'attacker-guess');
  eq(verifyHmacSha256(BODY, sig, SECRET), false);
});

// ---------- length-mismatch / malformed headers ----------

test('verifyHmacSha256 · length-mismatch (truncated hex) fails without throwing', () => {
  const sig = sign(BODY, SECRET).slice(0, 30);
  eq(verifyHmacSha256(BODY, sig, SECRET), false);
});

test('verifyHmacSha256 · length-mismatch (extra hex) fails without throwing', () => {
  const sig = sign(BODY, SECRET) + 'deadbeef';
  eq(verifyHmacSha256(BODY, sig, SECRET), false);
});

test('verifyHmacSha256 · empty header fails', () => {
  eq(verifyHmacSha256(BODY, '', SECRET), false);
});

test('verifyHmacSha256 · non-hex header fails (decodes to wrong length)', () => {
  // "notahex!" → Buffer.from(..., 'hex') yields zero-length buffer → length mismatch path.
  eq(verifyHmacSha256(BODY, 'notahex!', SECRET), false);
});

// ---------- missing inputs (default-deny) ----------

test('verifyHmacSha256 · missing header (null) returns false', () => {
  eq(verifyHmacSha256(BODY, null, SECRET), false);
});

test('verifyHmacSha256 · missing secret (empty string) returns false', () => {
  const sig = sign(BODY, SECRET);
  eq(verifyHmacSha256(BODY, sig, ''), false);
});

test('verifyHmacSha256 · missing both header and secret returns false', () => {
  eq(verifyHmacSha256(BODY, null, ''), false);
});

// ---------- runner ----------

let passed = 0;
let failed = 0;
const fails: { name: string; err: string }[] = [];
for (const c of cases) {
  try {
    c.fn();
    passed++;
    console.log('  ✓', c.name);
  } catch (e) {
    failed++;
    fails.push({ name: c.name, err: (e as Error).message });
    console.error('  ✗', c.name);
  }
}
console.log(`\n${passed}/${cases.length} passed${failed ? ` (${failed} failed)` : ''}`);
if (failed) {
  console.error('\nFailures:');
  for (const f of fails) console.error(` · ${f.name}\n     ${f.err}`);
  process.exit(1);
}
