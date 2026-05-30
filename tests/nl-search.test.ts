/**
 * Tests for lib/nl-search — the pure core behind the AI-powered natural-language
 * listing search (Vercel AI Gateway).
 *
 * The LLM call itself is NOT exercised here (no network in CI). Instead we test
 * the deterministic pieces that guard everything the model emits:
 *   - resolveVocab     — free-text area/developer → canonical vocabulary
 *   - sanitizeFilters  — clamp/enum/canonicalise the (untrusted) model output
 *   - heuristicParse   — the no-LLM fallback parser (also the gateway-down path)
 *
 * Run: npm test  (or: npm run test:search)
 * Style: zero-dep micro test framework, matching tests/rera.test.ts.
 */

import {
  resolveVocab,
  sanitizeFilters,
  heuristicParse,
  type SearchVocab,
} from '../lib/nl-search';

// ---------- micro test framework (zero deps) ----------

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Fixed vocab so every assertion is deterministic regardless of seed data.
const VOCAB: SearchVocab = {
  communities: ['Dubai Marina', 'Business Bay', 'Downtown Dubai', 'Palm Jumeirah', 'Jumeirah Village Circle'],
  developers: ['Emaar', 'Damac', 'Nakheel', 'Sobha Realty'],
};

// ---------- resolveVocab ----------

test('resolveVocab · exact, case-insensitive', () => {
  eq(resolveVocab('dubai marina', VOCAB.communities), 'Dubai Marina');
});

test('resolveVocab · canonical contains the shorthand', () => {
  eq(resolveVocab('Marina', VOCAB.communities), 'Dubai Marina');
});

test('resolveVocab · phrase contains the canonical name', () => {
  eq(resolveVocab('somewhere in Business Bay please', VOCAB.communities), 'Business Bay');
});

test('resolveVocab · no plausible match → undefined', () => {
  eq(resolveVocab('Atlantis', VOCAB.communities), undefined);
});

test('resolveVocab · null / empty → undefined', () => {
  eq(resolveVocab(null, VOCAB.communities), undefined);
  eq(resolveVocab(undefined, VOCAB.communities), undefined);
  eq(resolveVocab('   ', VOCAB.communities), undefined);
});

// ---------- sanitizeFilters ----------

test('sanitizeFilters · clamps an out-of-range drop to 90', () => {
  eq(sanitizeFilters({ minDropPct: 250 }, VOCAB), { minDropPct: 90 });
});

test('sanitizeFilters · drops a zero / negative drop', () => {
  eq(sanitizeFilters({ minDropPct: 0 }, VOCAB), {});
});

test('sanitizeFilters · coerces a numeric string price', () => {
  eq(sanitizeFilters({ maxPrice: '3,000,000' }, VOCAB), { maxPrice: 3000000 });
});

test('sanitizeFilters · drops a negative price', () => {
  eq(sanitizeFilters({ maxPrice: -10 }, VOCAB), {});
});

test('sanitizeFilters · omits default-equivalent enums (all / any / newest)', () => {
  eq(sanitizeFilters({ type: 'all', beds: 'any', sort: 'newest' }, VOCAB), {});
});

test('sanitizeFilters · keeps valid enums', () => {
  eq(
    sanitizeFilters({ type: 'off_plan', beds: '2', sort: 'price_asc' }, VOCAB),
    { type: 'off_plan', beds: '2', sort: 'price_asc' },
  );
});

test('sanitizeFilters · rejects bogus enums', () => {
  eq(sanitizeFilters({ type: 'rented', beds: '7', sort: 'random' }, VOCAB), {});
});

test('sanitizeFilters · canonicalises community + developer, drops unknowns', () => {
  eq(
    sanitizeFilters({ community: 'marina', developer: 'emaar' }, VOCAB),
    { community: 'Dubai Marina', developer: 'Emaar' },
  );
  eq(sanitizeFilters({ community: 'Narnia', developer: 'Acme' }, VOCAB), {});
});

// ---------- heuristicParse ----------

test('heuristicParse · full brief maps every signal', () => {
  eq(
    heuristicParse('2-bed in Dubai Marina under 3M at least 10% below OP, off-plan', VOCAB),
    { type: 'off_plan', beds: '2', community: 'Dubai Marina', minDropPct: 10, maxPrice: 3000000 },
  );
});

test('heuristicParse · studio + ready + cheapest', () => {
  eq(
    heuristicParse('studio ready apartment, cheapest first', VOCAB),
    { type: 'ready', beds: 'studio', sort: 'price_asc' },
  );
});

test('heuristicParse · 4 bedrooms collapses to 4+ and reads biggest discount', () => {
  eq(
    heuristicParse('4 bedroom with the biggest discount in Palm Jumeirah', VOCAB),
    { beds: '4+', community: 'Palm Jumeirah', sort: 'drop_desc' },
  );
});

test('heuristicParse · developer match; "newest" is default so sort omitted', () => {
  eq(heuristicParse('show me the newest Emaar listings', VOCAB), { developer: 'Emaar' });
});

test('heuristicParse · 800k budget parses to 800000', () => {
  eq(heuristicParse('1-bed under 800k', VOCAB), { beds: '1', maxPrice: 800000 });
});

test('heuristicParse · no actionable signal → empty filters', () => {
  eq(heuristicParse('a lovely place to live', VOCAB), {});
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
