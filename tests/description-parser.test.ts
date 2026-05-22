/**
 * Tests for lib/description-parser against realistic PropertyFinder listing copy.
 *
 * Run: npm test
 *
 * Sources for the test inputs are hand-curated to match the patterns brokers
 * actually use on PropertyFinder. Update as we encounter new variants in the
 * wild — failing tests will tell you when the parser needs a tune-up.
 */
import {
  parseOp,
  parseHandover,
  parseView,
  parseFloor,
  parsePaymentStatus,
  parseBua,
  parsePlotSize,
  composeUnitType,
  extractFeatures,
} from '../lib/description-parser';

// ---------- micro test framework (zero deps) ----------

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function truthy(v: unknown, msg?: string) {
  if (!v) throw new Error(`${msg ?? 'expected truthy'}, got ${JSON.stringify(v)}`);
}
function falsy(v: unknown, msg?: string) {
  if (v) throw new Error(`${msg ?? 'expected falsy'}, got ${JSON.stringify(v)}`);
}

// ---------- parseOp ----------

test('parseOp · "Original Price: AED 2,300,000"', () => {
  const r = parseOp('Distress sale, below OP. Original Price: AED 2,300,000. Now selling at AED 2,150,000.', 2_150_000);
  eq(r.op, 2_300_000);
});

test('parseOp · "OP 3.5M" shorthand', () => {
  const r = parseOp('Premium villa, OP 3.5M, selling 3.1M urgent.', 3_100_000);
  eq(r.op, 3_500_000);
});

test('parseOp · "down from AED 4.8M"', () => {
  const r = parseOp('Down from AED 4.8M, motivated seller, vacant on transfer.', 4_500_000);
  eq(r.op, 4_800_000);
});

test('parseOp · "12% below OP" → computes from current', () => {
  const r = parseOp('Premium unit, 12% below OP, urgent sale.', 2_640_000);
  truthy(r.op);
  eq(r.dropPct, 12);
  // 2_640_000 / 0.88 = 3_000_000
  eq(r.op, 3_000_000);
});

test('parseOp · "Below OP by 8%"', () => {
  const r = parseOp('Below OP by 8%! Premium unit.', 2_300_000);
  eq(r.dropPct, 8);
});

test('parseOp · returns null when nothing matches', () => {
  const r = parseOp('Beautiful spacious apartment with great view. Call now!', 1_000_000);
  eq(r.op, null);
  eq(r.dropPct, null);
});

test('parseOp · ignores values below the OP candidate that is < current', () => {
  // "Service charge AED 18,000" should not be picked as OP.
  const r = parseOp('Service charge: AED 18,000. OP: AED 2,300,000. Asking 2,150,000.', 2_150_000);
  eq(r.op, 2_300_000);
});

// ---------- parseHandover ----------

test('parseHandover · "Handover: Q3 2028"', () => {
  eq(parseHandover('Premium unit. Handover: Q3 2028'), 'Q3 2028');
});

test('parseHandover · "Q1 2027"', () => {
  eq(parseHandover('Off-plan, Q1 2027, attractive payment plan.'), 'Q1 2027');
});

test('parseHandover · "Completion 2028"', () => {
  eq(parseHandover('Completion 2028. 60% paid.'), '2028');
});

test('parseHandover · ignores year not in window', () => {
  eq(parseHandover('Built in 2015. Currently tenanted.'), null);
});

// ---------- parseView ----------

test('parseView · "Marina View"', () => {
  eq(parseView('Spacious 2BR with full Marina View'), 'Marina View');
});

test('parseView · "Sea Views" normalised to "Sea View"', () => {
  eq(parseView('Stunning Sea Views from every room.'), 'Sea View');
});

test('parseView · "Burj Khalifa View"', () => {
  eq(parseView('Iconic Burj Khalifa View and Downtown skyline.'), 'Burj Khalifa View');
});

test('parseView · null when no view', () => {
  eq(parseView('Spacious unit, fully fitted kitchen, 2 parking.'), null);
});

// ---------- parseFloor ----------

test('parseFloor · "High Floor"', () => {
  eq(parseFloor('Higher floor unit with stunning view.'), 'High Floor');
});

test('parseFloor · "Corner Unit"', () => {
  eq(parseFloor('Spacious corner unit, fully fitted.'), 'Corner Unit');
});

test('parseFloor · "Above 30th Floor"', () => {
  eq(parseFloor('Listed above 30th floor with unobstructed view.'), 'Above 30th Floor');
});

test('parseFloor · "G+2"', () => {
  eq(parseFloor('G+2 townhouse with private garden.'), 'G+2');
});

test('parseFloor · "35th Floor"', () => {
  eq(parseFloor('Located on the 35th floor.'), '35th Floor');
});

// ---------- parsePaymentStatus ----------

test('parsePaymentStatus · "50% Paid"', () => {
  eq(parsePaymentStatus('Off-plan 50% paid, ready for re-assignment.'), '50% Paid');
});

test('parsePaymentStatus · "Re-entry Opportunity"', () => {
  eq(parsePaymentStatus('Distress! Re-entry opportunity for serious buyers.'), 'Re-entry Opportunity');
});

test('parsePaymentStatus · "Post-Handover Payment Plan"', () => {
  eq(parsePaymentStatus('60/40 with post-handover payment plan, 3 years.'), 'Post-Handover Payment Plan');
});

test('parsePaymentStatus · "3 Year Post Handover" (real PF copy)', () => {
  eq(parsePaymentStatus('Status: Below Original Price | 3-Year Post-Handover'), '3-Year Post-Handover');
});

test('parsePaymentStatus · "3 years Post Handover" plural variant', () => {
  eq(parsePaymentStatus('Premium finishes. 3 years Post Handover. Smart Home enabled.'), '3-Year Post-Handover');
});

test('parsePaymentStatus · "PHPP" shorthand', () => {
  eq(parsePaymentStatus('Branded Residences | Phpp | Exclusive Below OP'), 'Post-Handover Payment Plan');
});

test('parseOp · sees value when title+description concatenated', () => {
  // The title alone has no OP. The description has it. Confirms our concat strategy.
  const hay = 'BELOW OP | Premium Marina Unit\n\nMarina view apartment, OP: AED 3,200,000, asking 2,900,000.';
  const r = parseOp(hay, 2_900_000);
  eq(r.op, 3_200_000);
});

// ---------- parseBua / parsePlotSize ----------

test('parseBua · "BUA: 2,100 sqft"', () => {
  eq(parseBua('Plot: 4500 sqft. BUA: 2,100 sqft.'), 2100);
});

test('parsePlotSize · "Plot Size: 5000 sqft"', () => {
  eq(parsePlotSize('Plot Size: 5,000 sqft. Premium location.'), 5000);
});

test('parseBua · with sqm converts', () => {
  // 195 sqm ≈ 2099 sqft
  const r = parseBua('BUA: 195 sqm. Plot 380 sqm.');
  truthy(r);
  if (r) truthy(Math.abs(r - 2099) <= 2, `expected ~2099, got ${r}`);
});

// ---------- composeUnitType ----------

test('composeUnitType · 4BR + maid villa', () => {
  eq(
    composeUnitType({ beds: '4', propertyType: 'Villa', description: '4BR + maid villa, private pool' }),
    '4 Bedroom Villa + Maid',
  );
});

test('composeUnitType · standalone villa', () => {
  eq(
    composeUnitType({ beds: '5', propertyType: 'Villa', description: 'Standalone villa, maid\'s room.' }),
    '5 Bedroom Standalone Villa + Maid',
  );
});

test('composeUnitType · studio', () => {
  eq(composeUnitType({ beds: 'studio', propertyType: 'Apartment' }), 'Studio Apartment');
});

test('composeUnitType · 1BR apartment, no maid', () => {
  eq(composeUnitType({ beds: '1', propertyType: 'Apartment', description: 'Cozy 1 bedroom apartment.' }), '1 Bedroom Apartment');
});

// ---------- extractFeatures ----------

test('extractFeatures · includes view + amenities + description scan', () => {
  const r = extractFeatures({
    amenities: ['Swimming Pool', 'Gym'],
    description: 'Cavalli Branded residence with Private Pool and Maid\'s Room.',
    view: 'Marina View',
    floorPosition: 'High Floor',
  });
  // Order matters: view + floor come first, then amenities, then description
  // matches. Dedupe within set.
  eq(r.includes('Marina View'), true);
  eq(r.includes('High Floor'), true);
  eq(r.includes('Private Pool'), true);
  eq(r.includes('Cavalli Branded'), true);
  eq(r.includes('Maid\'s Room'), true);
});

test('extractFeatures · caps at 8 entries', () => {
  const r = extractFeatures({
    amenities: ['A','B','C','D','E','F','G','H','I','J','K','L'],
    description: '',
  });
  eq(r.length, 8);
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
