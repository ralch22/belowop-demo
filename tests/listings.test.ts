/**
 * Tests for lib/listings — the engine behind the public listings table.
 *
 * Covers (mapped to RTM):
 *   SRS-FR-21 — Filters: type, beds, area, developer, max price, min drop %
 *   SRS-FR-22 — Sort: newest, price asc/desc, biggest drop, AED/m² asc
 *   SRS-FR-23 — URL params ↔ Filters round-trip
 *   SRS-FR-24 — 25/page server pagination math
 *
 * Run: npm test
 *
 * Style: zero-dep micro test framework, matching tests/description-parser.test.ts.
 * Listings used here are hand-built fixtures, not the live seed data, so the
 * tests stay deterministic if the seed file changes.
 */

import {
  applyFilters,
  filtersFromParams,
  paramsFromFilters,
  buildEnquiryText,
  type Filters,
  type Listing,
} from '../lib/listings';
import { bedsLabel, pickImageUrls, opaqueIdFromRef } from '../lib/format';

// ---------- micro test framework (zero deps) ----------

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------- fixtures ----------

function mk(overrides: Partial<Listing>): Listing {
  return {
    ref: 'PF-X',
    project: 'Project X',
    unit: '101',
    developer: 'EMAAR',
    community: 'Dubai Marina',
    type: 'off_plan',
    beds: 1,
    sqft: 800,
    currentPrice: 1_000_000,
    originalPrice: 1_200_000,           // –16.7%
    listedAt: '2026-05-20T00:00:00.000Z',
    imageId: 'x',
    ...overrides,
  };
}

// A deliberately small + varied set so we can isolate each filter dimension.
// Sorted out-of-order so sort tests have to actually do work.
const FIXTURES: Listing[] = [
  mk({ ref: 'PF-A', project: 'Marina Bay',  community: 'Dubai Marina', developer: 'EMAAR',
       type: 'off_plan', beds: 'studio', sqft: 500,  currentPrice: 800_000,   originalPrice: 1_000_000,  // –20%
       listedAt: '2026-05-15T00:00:00.000Z' }),
  mk({ ref: 'PF-B', project: 'Palm Vista',  community: 'Palm Jumeirah', developer: 'DAMAC',
       type: 'ready',    beds: 2,         sqft: 1200, currentPrice: 2_500_000, originalPrice: 2_700_000,  // –7.4%
       listedAt: '2026-05-18T00:00:00.000Z' }),
  mk({ ref: 'PF-C', project: 'Downtown',    community: 'Downtown Dubai', developer: 'EMAAR',
       type: 'off_plan', beds: 3,         sqft: 1800, currentPrice: 4_000_000, originalPrice: 4_200_000,  // –4.8%
       listedAt: '2026-05-20T00:00:00.000Z' }),
  mk({ ref: 'PF-D', project: 'JBR Estate',  community: 'JBR',            developer: 'DAMAC',
       type: 'ready',    beds: 4,         sqft: 2500, currentPrice: 6_000_000, originalPrice: 7_000_000,  // –14.3%
       listedAt: '2026-05-10T00:00:00.000Z' }),
  mk({ ref: 'PF-E', project: 'Marina Mid',  community: 'Dubai Marina',   developer: 'NAKHEEL',
       type: 'off_plan', beds: 1,         sqft: 700,  currentPrice: 1_400_000, originalPrice: 1_500_000,  // –6.7%
       listedAt: '2026-05-19T00:00:00.000Z' }),
  mk({ ref: 'PF-F', project: 'Penthouse',   community: 'Downtown Dubai', developer: 'EMAAR',
       type: 'ready',    beds: 5,         sqft: 4000, currentPrice: 12_000_000, originalPrice: 15_000_000, // –20%
       listedAt: '2026-05-21T00:00:00.000Z' }),
];

const refs = (xs: Listing[]) => xs.map((x) => x.ref);

// ---------- applyFilters · type ----------

test('applyFilters · no filters returns everything (no mutation)', () => {
  const out = applyFilters(FIXTURES, {});
  eq(out.length, FIXTURES.length);
  // Pure: must not mutate input
  eq(FIXTURES.length, 6);
});

test('applyFilters · type=all is a no-op', () => {
  const out = applyFilters(FIXTURES, { type: 'all' });
  eq(out.length, FIXTURES.length);
});

test('applyFilters · type=off_plan', () => {
  const out = applyFilters(FIXTURES, { type: 'off_plan' });
  eq(refs(out).sort(), ['PF-A', 'PF-C', 'PF-E']);
});

test('applyFilters · type=ready', () => {
  const out = applyFilters(FIXTURES, { type: 'ready' });
  eq(refs(out).sort(), ['PF-B', 'PF-D', 'PF-F']);
});

// ---------- applyFilters · beds ----------

test('applyFilters · beds=studio', () => {
  const out = applyFilters(FIXTURES, { beds: 'studio' });
  eq(refs(out), ['PF-A']);
});

test('applyFilters · beds=1', () => {
  const out = applyFilters(FIXTURES, { beds: '1' });
  eq(refs(out), ['PF-E']);
});

test('applyFilters · beds=4+ matches 4 and 5', () => {
  const out = applyFilters(FIXTURES, { beds: '4+' });
  eq(refs(out).sort(), ['PF-D', 'PF-F']);
});

test('applyFilters · beds=any is a no-op', () => {
  const out = applyFilters(FIXTURES, { beds: 'any' });
  eq(out.length, FIXTURES.length);
});

// Regression: a listing stored with the literal '4+' bucket (not a number) must
// still be matched by the 4+ filter. Before the fix, db.ts coerced '4+' via
// Number('4+') → NaN, so `NaN >= 4` was false and these rows silently vanished.
test('applyFilters · beds=4+ also matches the literal "4+" bucket', () => {
  const withBucket = [...FIXTURES, mk({ ref: 'PF-G', beds: '4+' })];
  const out = applyFilters(withBucket, { beds: '4+' });
  eq(refs(out).sort(), ['PF-D', 'PF-F', 'PF-G']);
});

// ---------- bedsLabel (regression: "NaN BR" leak via stored '4+') ----------

// The home page RSC flight data once carried `"beds":"$NaN"` for ~56 listings:
// db.ts mapped a stored '4+' bucket through Number('4+') → NaN, and bedsLabel
// then rendered `${NaN} BR` = "NaN BR". Lock the contract for every input shape.
test('bedsLabel · studio', () => {
  eq(bedsLabel('studio'), 'Studio');
});

test('bedsLabel · 4+ bucket renders "4+ BR" (never "NaN BR")', () => {
  eq(bedsLabel('4+'), '4+ BR');
});

test('bedsLabel · numeric beds', () => {
  eq(bedsLabel(2), '2 BR');
});

test('bedsLabel · NaN / non-finite falls back to em dash', () => {
  eq(bedsLabel(NaN), '—');
  eq(bedsLabel(Number('4+')), '—'); // the exact coercion that caused the bug
});

// ---------- applyFilters · area / developer ----------

test('applyFilters · community filter (exact match)', () => {
  const out = applyFilters(FIXTURES, { community: 'Dubai Marina' });
  eq(refs(out).sort(), ['PF-A', 'PF-E']);
});

test('applyFilters · developer filter (exact match)', () => {
  const out = applyFilters(FIXTURES, { developer: 'DAMAC' });
  eq(refs(out).sort(), ['PF-B', 'PF-D']);
});

// ---------- applyFilters · price ----------

test('applyFilters · maxPrice excludes above-cap', () => {
  const out = applyFilters(FIXTURES, { maxPrice: 2_500_000 });
  eq(refs(out).sort(), ['PF-A', 'PF-B', 'PF-E']);
});

test('applyFilters · maxPrice boundary is inclusive', () => {
  // PF-B is exactly 2.5M — should be included at maxPrice 2,500,000.
  const out = applyFilters(FIXTURES, { maxPrice: 2_500_000 });
  eq(out.some((l) => l.ref === 'PF-B'), true);
});

// ---------- applyFilters · minDropPct ----------

test('applyFilters · minDropPct=10 keeps only deals ≥10% below OP', () => {
  // –20% (A), –7.4% (B), –4.8% (C), –14.3% (D), –6.7% (E), –20% (F)
  // ≥10% drop → A, D, F
  const out = applyFilters(FIXTURES, { minDropPct: 10 });
  eq(refs(out).sort(), ['PF-A', 'PF-D', 'PF-F']);
});

test('applyFilters · minDropPct=0 keeps anything below OP', () => {
  const out = applyFilters(FIXTURES, { minDropPct: 0 });
  // All 6 are below OP in fixtures
  eq(out.length, 6);
});

test('applyFilters · minDropPct accepts signed input (negative also flips correctly)', () => {
  // The function takes abs() so users can pass either 10 or -10.
  const a = applyFilters(FIXTURES, { minDropPct: 10 });
  const b = applyFilters(FIXTURES, { minDropPct: -10 });
  eq(refs(a).sort(), refs(b).sort());
});

// ---------- applyFilters · combinations ----------

test('applyFilters · multi-filter composition (type + community + minDropPct)', () => {
  // off_plan, in Dubai Marina, ≥10% drop → only PF-A (PF-E is –6.7%)
  const out = applyFilters(FIXTURES, {
    type: 'off_plan',
    community: 'Dubai Marina',
    minDropPct: 10,
  });
  eq(refs(out), ['PF-A']);
});

test('applyFilters · empty result when no rows match', () => {
  const out = applyFilters(FIXTURES, {
    community: 'Dubai Marina',
    developer: 'EMAAR',
    beds: '3',
  });
  eq(out, []);
});

// ---------- applyFilters · sort ----------

test('applyFilters · sort=newest (default)', () => {
  const out = applyFilters(FIXTURES, {});
  // listedAt order desc: F (21), C (20), E (19), B (18), A (15), D (10)
  eq(refs(out), ['PF-F', 'PF-C', 'PF-E', 'PF-B', 'PF-A', 'PF-D']);
});

test('applyFilters · sort=price_asc', () => {
  const out = applyFilters(FIXTURES, { sort: 'price_asc' });
  // 800k → 1.4M → 2.5M → 4M → 6M → 12M
  eq(refs(out), ['PF-A', 'PF-E', 'PF-B', 'PF-C', 'PF-D', 'PF-F']);
});

test('applyFilters · sort=price_desc', () => {
  const out = applyFilters(FIXTURES, { sort: 'price_desc' });
  eq(refs(out), ['PF-F', 'PF-D', 'PF-C', 'PF-B', 'PF-E', 'PF-A']);
});

test('applyFilters · sort=drop_desc puts biggest drops first', () => {
  // –20% (A & F), –14.3% (D), –7.4% (B), –6.7% (E), –4.8% (C)
  // drop_desc sorts by dropPct ASC (most-negative first → biggest drop first)
  const out = applyFilters(FIXTURES, { sort: 'drop_desc' });
  // The two –20% can be in either order — assert the lead pair is the deepest two
  const head = refs(out.slice(0, 2)).sort();
  eq(head, ['PF-A', 'PF-F']);
  eq(refs(out).slice(2), ['PF-D', 'PF-B', 'PF-E', 'PF-C']);
});

test('applyFilters · sort=ppsqm_asc (price per sqft, since sqm is just a constant scale)', () => {
  // ppsqft: A 1600, E 2000, B 2083, C 2222, D 2400, F 3000
  const out = applyFilters(FIXTURES, { sort: 'ppsqm_asc' });
  eq(refs(out), ['PF-A', 'PF-E', 'PF-B', 'PF-C', 'PF-D', 'PF-F']);
});

test('applyFilters · sort + filter compose correctly', () => {
  // Ready listings sorted by biggest drop: F (–20%) > D (–14.3%) > B (–7.4%)
  const out = applyFilters(FIXTURES, { type: 'ready', sort: 'drop_desc' });
  eq(refs(out), ['PF-F', 'PF-D', 'PF-B']);
});

test('applyFilters · does not mutate input array', () => {
  const before = refs(FIXTURES).slice();
  applyFilters(FIXTURES, { sort: 'price_desc' });
  eq(refs(FIXTURES), before);
});

// ---------- filtersFromParams ----------

test('filtersFromParams · empty params → all defaults', () => {
  const f = filtersFromParams(new URLSearchParams(''));
  eq(f.type, 'all');
  eq(f.beds, 'any');
  eq(f.community, undefined);
  eq(f.developer, undefined);
  eq(f.minDropPct, undefined);
  eq(f.maxPrice, undefined);
  eq(f.sort, 'newest');
});

test('filtersFromParams · all keys populated', () => {
  const f = filtersFromParams(new URLSearchParams(
    'type=off_plan&beds=2&area=Dubai%20Marina&dev=EMAAR&drop=10&max=5000000&sort=drop_desc',
  ));
  eq(f.type, 'off_plan');
  eq(f.beds, '2');
  eq(f.community, 'Dubai Marina');
  eq(f.developer, 'EMAAR');
  eq(f.minDropPct, 10);
  eq(f.maxPrice, 5_000_000);
  eq(f.sort, 'drop_desc');
});

test('filtersFromParams · unknown keys are ignored', () => {
  const f = filtersFromParams(new URLSearchParams('type=ready&unknown=foo&page=2'));
  eq(f.type, 'ready');
});

test('filtersFromParams · non-numeric drop/max collapse to undefined (no NaN leak)', () => {
  const f = filtersFromParams(new URLSearchParams('drop=abc&max=xyz'));
  eq(f.minDropPct, undefined);
  eq(f.maxPrice, undefined);
});

// ---------- paramsFromFilters ----------

test('paramsFromFilters · default values are stripped from URL', () => {
  const p = paramsFromFilters(new URLSearchParams(''), {
    type: 'all',
    beds: 'any',
    community: undefined,
    developer: undefined,
    minDropPct: 0,
    maxPrice: 0,
    sort: undefined,
  });
  eq(p.toString(), '');
});

test('paramsFromFilters · non-default values are written', () => {
  const p = paramsFromFilters(new URLSearchParams(''), {
    type: 'off_plan',
    beds: '3',
    community: 'Dubai Marina',
    developer: 'EMAAR',
    minDropPct: 10,
    maxPrice: 5_000_000,
    sort: 'drop_desc',
  });
  // Order isn't guaranteed by URLSearchParams.toString() across runtimes, so
  // assert key presence individually.
  const got = new URLSearchParams(p.toString());
  eq(got.get('type'), 'off_plan');
  eq(got.get('beds'), '3');
  eq(got.get('area'), 'Dubai Marina');
  eq(got.get('dev'), 'EMAAR');
  eq(got.get('drop'), '10');
  eq(got.get('max'), '5000000');
  eq(got.get('sort'), 'drop_desc');
});

test('paramsFromFilters · partial update preserves untouched keys', () => {
  const p = new URLSearchParams('type=off_plan&beds=2&inquire=u-abc123');
  paramsFromFilters(p, { minDropPct: 15 });
  eq(p.get('type'), 'off_plan');
  eq(p.get('beds'), '2');
  eq(p.get('drop'), '15');
  // Untouched query keys (like inquire) survive
  eq(p.get('inquire'), 'u-abc123');
});

test('paramsFromFilters · setting a key to default value removes it', () => {
  const p = new URLSearchParams('type=off_plan&drop=10');
  paramsFromFilters(p, { type: 'all', minDropPct: 0 });
  eq(p.has('type'), false);
  eq(p.has('drop'), false);
});

// ---------- round-trip ----------

test('round-trip · filtersFromParams(paramsFromFilters(x)) recovers x', () => {
  const original: Filters = {
    type: 'off_plan',
    beds: '2',
    community: 'Dubai Marina',
    developer: 'EMAAR',
    minDropPct: 10,
    maxPrice: 5_000_000,
    sort: 'drop_desc',
  };
  const params = paramsFromFilters(new URLSearchParams(''), original);
  const recovered = filtersFromParams(params);
  eq(recovered, original);
});

test('round-trip · default Filters → empty URL → default Filters', () => {
  const defaultFilters: Filters = {
    type: 'all',
    beds: 'any',
    community: undefined,
    developer: undefined,
    minDropPct: 0,         // becomes undefined after round-trip (0 is default)
    maxPrice: 0,
    sort: 'newest',
  };
  const params = paramsFromFilters(new URLSearchParams(''), defaultFilters);
  eq(params.toString(), '');
  const recovered = filtersFromParams(params);
  eq(recovered.type, 'all');
  eq(recovered.beds, 'any');
  eq(recovered.minDropPct, undefined);
  eq(recovered.maxPrice, undefined);
  eq(recovered.sort, 'newest');
});

// ---------- pagination math (SRS-FR-24) ----------

const PAGE_SIZE = 25;

test('pagination · empty list → 1 page (avoid 0/0 NaN)', () => {
  const total = 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  eq(totalPages, 1);
});

test('pagination · exactly 25 listings → 1 page', () => {
  const total = 25;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  eq(totalPages, 1);
});

test('pagination · 26 listings → 2 pages', () => {
  const total = 26;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  eq(totalPages, 2);
});

test('pagination · 102 listings (production-realistic) → 5 pages', () => {
  const total = 102;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  eq(totalPages, 5);
});

test('pagination · page 1 slice is items [0..25)', () => {
  const all = Array.from({ length: 102 }, (_, i) => i);
  const page = 1;
  const slice = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  eq(slice.length, 25);
  eq(slice[0], 0);
  eq(slice[24], 24);
});

test('pagination · last page slice has only the remainder', () => {
  const all = Array.from({ length: 102 }, (_, i) => i);
  const totalPages = Math.ceil(all.length / PAGE_SIZE); // 5
  const slice = all.slice((totalPages - 1) * PAGE_SIZE, totalPages * PAGE_SIZE);
  eq(slice.length, 2);            // 102 = 4*25 + 2
  eq(slice[0], 100);
  eq(slice[1], 101);
});

// ---------- buildEnquiryText (privacy: opaque id, never the PF ref) ----------
//
// The WhatsApp enquiry a buyer sends to Jad must carry only the opaque internal
// id (u-xxxxxx). Leaking the PropertyFinder reference here would expose the
// underlying source listing to buyers — the exact bug this fixes.

test('buildEnquiryText · embeds the opaque id, never the raw PF ref', () => {
  const l = mk({ ref: 'PF-44021', project: 'Marina Bay', currentPrice: 1_000_000 });
  const text = buildEnquiryText(l);
  const id = opaqueIdFromRef('PF-44021');
  eq(text.includes(id), true, 'enquiry should contain the opaque id');
  eq(text.includes('PF-44021'), false, 'enquiry must NOT contain the raw PF ref');
  eq(/\bPF-\d+\b/.test(text), false, 'enquiry must not contain any PF-#### token');
});

test('buildEnquiryText · uses the explicit heading when provided', () => {
  const l = mk({ ref: 'PF-7', project: 'Project X', currentPrice: 2_500_000 });
  const text = buildEnquiryText(l, 'Marina Bay, Tower 2');
  eq(text.includes('Marina Bay, Tower 2'), true, 'should use the passed heading');
  eq(text.includes(opaqueIdFromRef('PF-7')), true);
});

test('buildEnquiryText · falls back to project when no heading given', () => {
  const l = mk({ ref: 'PF-9', project: 'Downtown Views', currentPrice: 3_000_000 });
  const text = buildEnquiryText(l);
  eq(text.includes('Downtown Views'), true);
});

test('buildEnquiryText · includes a formatted AED price', () => {
  const l = mk({ ref: 'PF-1', currentPrice: 1_234_567 });
  const text = buildEnquiryText(l);
  // formatAED uses thousands separators (en-AE → "1,234,567").
  eq(text.includes('1,234,567'), true, 'price should be thousands-formatted');
});

// ---------- pickImageUrls (gallery merge: blob preferred, source fallback) ----------

test('pickImageUrls · prefers the blob URL per index, source fills the rest', () => {
  const blob = ['b0', 'b1'];
  const source = ['s0', 's1', 's2'];
  eq(pickImageUrls(blob, source), ['b0', 'b1', 's2']);
});

test('pickImageUrls · returns every image (longer array sets the length)', () => {
  const blob = ['b0'];
  const source = ['s0', 's1', 's2', 's3'];
  eq(pickImageUrls(blob, source).length, 4);
});

test('pickImageUrls · all blob when blob is the complete set', () => {
  eq(pickImageUrls(['b0', 'b1', 'b2'], ['s0', 's1', 's2']), ['b0', 'b1', 'b2']);
});

test('pickImageUrls · filters out falsy entries', () => {
  const blob = ['b0', '', 'b2'] as string[];
  const source = ['s0', 's1', 's2'];
  // '' at index 1 is dropped from blob, so index 1 falls back to source.
  eq(pickImageUrls(blob, source), ['b0', 's1', 'b2']);
});

test('pickImageUrls · dedupes while preserving first-seen order', () => {
  eq(pickImageUrls(['a', 'b'], ['a', 'b']), ['a', 'b']);
});

test('pickImageUrls · empty / null inputs → empty array', () => {
  eq(pickImageUrls(), []);
  eq(pickImageUrls(null, null), []);
  eq(pickImageUrls([], []), []);
});

test('pickImageUrls · source-only listing still returns its photos', () => {
  eq(pickImageUrls([], ['s0', 's1']), ['s0', 's1']);
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
