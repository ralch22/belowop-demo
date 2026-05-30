/**
 * Tests for lib/brokers-csv — the pure, driver-free parser shared by the import
 * CLI (db/import-brokers.ts) and the server-side admin brokers-import endpoint.
 *
 * The DB upsert is NOT exercised here (no network in CI). We test the parsing,
 * field derivation, and the BROKER_COLUMNS ↔ brokerRowToValues alignment that
 * the batched server INSERT depends on.
 *
 * Run: npm test  (or: npm run test:brokers)
 * Style: zero-dep micro test framework, matching tests/rera.test.ts.
 */

import {
  parseBrokersCsv,
  brokerRowToValues,
  BROKER_COLUMNS,
} from '../lib/brokers-csv';

// ---------- micro test framework (zero deps) ----------

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg ?? 'expected truthy');
}

const HEADER =
  'participant_id,real_estate_broker_id,broker_number,broker_name_ar,broker_name_en,' +
  'gender,license_start_date,license_end_date,webpage,phone,fax,real_estate_id,real_estate_number';

// ---------- parseBrokersCsv ----------

test('parses a clean row and derives firm domain/name + ISO dates', () => {
  const csv = `${HEADER}\n101,202,BRK-1,محمد,Mohammed Ali,1,01-02-2023,01-02-2026,https://www.famproperties.com/agents/x,+97140000000,,RE9,RE-9`;
  const { rows, total, skipped, missingColumns } = parseBrokersCsv(csv);
  eq(missingColumns, false);
  eq(total, 1);
  eq(skipped, 0);
  eq(rows.length, 1);
  const r = rows[0];
  eq(r.brokerNumber, 'BRK-1');
  eq(r.nameEn, 'Mohammed Ali');
  eq(r.nameAr, 'محمد');
  eq(r.gender, 1);
  eq(r.licenseStart, '2023-02-01');
  eq(r.licenseEnd, '2026-02-01');
  eq(r.firmDomain, 'famproperties.com');
  eq(r.firmName, 'fäm Properties'); // FIRM_NAME_OVERRIDES hit
  eq(r.phone, '+97140000000');
  eq(r.realEstateNumber, 'RE-9');
});

test('skips rows missing broker_number or broker_name_en', () => {
  const csv = `${HEADER}\n,,,,,,,,,,,,\n1,2,BRK-2,,Jane Broker,,,,,,,,`;
  const { rows, total, skipped } = parseBrokersCsv(csv);
  eq(total, 2);
  eq(skipped, 1);
  eq(rows.length, 1);
  eq(rows[0].brokerNumber, 'BRK-2');
});

test('handles quoted fields with embedded commas', () => {
  const csv = `${HEADER}\n1,2,BRK-3,,"Smith, John & Co",,,,bhomes.com,,,,`;
  const { rows } = parseBrokersCsv(csv);
  eq(rows[0].nameEn, 'Smith, John & Co');
  eq(rows[0].firmDomain, 'bhomes.com');
  eq(rows[0].firmName, 'Betterhomes');
});

test('unparseable date → null; blank optional fields → null', () => {
  const csv = `${HEADER}\n,,BRK-4,,No Dates,,garbage,,,,,,`;
  const { rows } = parseBrokersCsv(csv);
  eq(rows[0].licenseStart, null);
  eq(rows[0].licenseEnd, null);
  eq(rows[0].participantId, null);
  eq(rows[0].firmDomain, null);
  eq(rows[0].firmName, null);
});

test('missing required columns flagged', () => {
  const csv = `id,name\n1,foo`;
  const { rows, missingColumns } = parseBrokersCsv(csv);
  eq(missingColumns, true);
  eq(rows.length, 0);
});

test('empty / header-only input → no rows, no crash', () => {
  eq(parseBrokersCsv('').rows.length, 0);
  eq(parseBrokersCsv(HEADER).rows.length, 0);
});

// ---------- BROKER_COLUMNS ↔ brokerRowToValues alignment ----------

test('brokerRowToValues length matches BROKER_COLUMNS', () => {
  const csv = `${HEADER}\n1,2,BRK-5,,Align Test,,,,,,,,`;
  const { rows } = parseBrokersCsv(csv);
  const vals = brokerRowToValues(rows[0]);
  eq(vals.length, BROKER_COLUMNS.length);
});

test('source column is pinned to dld_csv in the trailing value', () => {
  const csv = `${HEADER}\n1,2,BRK-6,,Source Test,,,,,,,,`;
  const { rows } = parseBrokersCsv(csv);
  const vals = brokerRowToValues(rows[0]);
  eq(vals[BROKER_COLUMNS.indexOf('source')], 'dld_csv');
  eq(vals[BROKER_COLUMNS.indexOf('broker_number')], 'BRK-6');
  ok(BROKER_COLUMNS.includes('phone'), 'phone column present (stored, internal-only)');
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
