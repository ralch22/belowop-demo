/**
 * RTM gap-closing tests.
 *
 *  - SRS-FR-74: Telegram MarkdownV2 escaping covers every reserved character.
 *  - SRS-NFR-52: AED currency formatter (locale + grouping).
 *  - SRS-NFR-53: relative-time formatter (just-now → years).
 *
 * Run via `npm run test:format`. Uses the same zero-dep micro-runner as
 * tests/description-parser.test.ts.
 */
import { escapeMd } from '../lib/telegram';
import { formatAED, relativeTime, dropPct, dropColor, bedsLabel } from '../lib/format';
import { formatAedShort, formatUsdShort } from '../lib/description-parser';

// ---------- micro test framework ----------
type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------- escapeMd (SRS-FR-74) ----------
// MarkdownV2 reserved characters per https://core.telegram.org/bots/api#markdownv2-style
// Each MUST be backslash-escaped or Telegram rejects the message.

const RESERVED = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!', '\\'];

for (const c of RESERVED) {
  test(`escapeMd · escapes "${c}"`, () => {
    eq(escapeMd(`pre${c}post`), `pre\\${c}post`);
  });
}

test('escapeMd · leaves plain alphanumeric untouched', () => {
  eq(escapeMd('Hello World 123'), 'Hello World 123');
});

test('escapeMd · handles a real-world broker line', () => {
  // The kind of phrase that recurs in alert bodies — multiple reserved chars.
  const input = 'AED 2,300,000 (was 2.6M) — 12% below OP!';
  const output = escapeMd(input);
  // Smoke: every reserved char appearance should be preceded by a backslash.
  for (const c of RESERVED) {
    if (!input.includes(c)) continue;
    // Count escaped occurrences must equal count of the char itself.
    const escapedRe = new RegExp(`\\\\\\${c}`, 'g');
    const literalRe = new RegExp(`(?<!\\\\)\\${c}`, 'g');
    eq((output.match(escapedRe) || []).length, (input.match(literalRe) || []).length, `${c} count`);
  }
});

test('escapeMd · escapes a literal backslash', () => {
  // Input contains ONE backslash; output must contain TWO (the original is
  // now escaped per MarkdownV2 rules).
  eq(escapeMd('a\\b'), 'a\\\\b');
});

// ---------- formatAED (SRS-NFR-52) ----------

test('formatAED · groups thousands with locale separators', () => {
  // en-AE uses comma grouping; values must match what the UI renders.
  eq(formatAED(2_150_000), '2,150,000');
  eq(formatAED(850_000), '850,000');
  eq(formatAED(28_800_000), '28,800,000');
});

test('formatAED · handles zero and small values', () => {
  eq(formatAED(0), '0');
  eq(formatAED(99), '99');
});

test('formatAED · rounds floats (no decimals shown)', () => {
  eq(formatAED(2_150_000.4), '2,150,000');
  eq(formatAED(2_150_000.6), '2,150,001');
});

test('formatAedShort · "M" suffix for millions', () => {
  eq(formatAedShort(2_150_000), '2.15M');
  eq(formatAedShort(3_200_000), '3.2M');
  eq(formatAedShort(24_500_000), '24.5M');
});

test('formatAedShort · "K" suffix for thousands', () => {
  eq(formatAedShort(850_000), '850K');
  eq(formatAedShort(99_500), '100K');
});

test('formatUsdShort · converts at pegged 3.6725 rate', () => {
  // 3.2M AED / 3.6725 ≈ $871K; broker template uses ≈$872K (formatter rounds).
  const out = formatUsdShort(3_200_000);
  // Allow either rounding mode.
  if (out !== '$871K' && out !== '$872K') {
    throw new Error(`expected $871K or $872K, got ${out}`);
  }
});

// ---------- relativeTime (SRS-NFR-53) ----------

const NOW = Date.parse('2026-05-21T12:00:00Z');

test('relativeTime · just-now (<60s) shows "1m ago"', () => {
  const t = new Date(NOW - 30 * 1000).toISOString();
  eq(relativeTime(t, NOW), '1m ago');
});

test('relativeTime · minutes', () => {
  const t = new Date(NOW - 5 * 60 * 1000).toISOString();
  eq(relativeTime(t, NOW), '5m ago');
});

test('relativeTime · hours', () => {
  const t = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
  eq(relativeTime(t, NOW), '3h ago');
});

test('relativeTime · days', () => {
  const t = new Date(NOW - 4 * 24 * 60 * 60 * 1000).toISOString();
  eq(relativeTime(t, NOW), '4d ago');
});

test('relativeTime · months', () => {
  const t = new Date(NOW - 60 * 24 * 60 * 60 * 1000).toISOString();
  eq(relativeTime(t, NOW), '2mo ago');
});

// ---------- supporting format helpers ----------

function approx(a: number, b: number, tol = 1e-9, msg = ''): void {
  if (Math.abs(a - b) > tol) {
    throw new Error(`${msg || 'approx'}: |${a} − ${b}| = ${Math.abs(a - b)} > ${tol}`);
  }
}

test('dropPct · math', () => {
  eq(dropPct(900, 1000), -10);
  approx(dropPct(2_150_000, 2_342_300), -8.2098791786, 1e-6);
  approx(dropPct(2_100_000, 2_500_000), -16, 1e-6);
});

test('dropColor · tiered Tailwind classes', () => {
  eq(dropColor(-12).includes('red'), true);
  eq(dropColor(-7).includes('amber'), true);
  eq(dropColor(-3).includes('slate'), true);
});

test('bedsLabel · studio + numeric', () => {
  eq(bedsLabel('studio'), 'Studio');
  eq(bedsLabel(1), '1 BR');
  eq(bedsLabel(4), '4 BR');
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
