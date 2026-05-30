/**
 * Tests for lib/rera — the pure domain logic behind the public RERA broker
 * verification directory (/brokers).
 *
 * Covers:
 *   - normalizeFirmDomain  — webpage → bare host (www-stripped)
 *   - firmNameFromDomain   — domain → display name (overrides + humanise)
 *   - parseDldDate         — DLD date formats → ISO YYYY-MM-DD
 *   - licenseStatus        — active / expired / unknown at day granularity
 *   - daysUntilExpiry      — signed whole-day delta
 *   - isExpiringSoon       — active && within N days
 *   - licenseTone          — UI tone: active / expiring / expired / unknown
 *   - formatLicenseDate    — ISO → "2 Jan 2026" (UTC, en-GB)
 *
 * Run: npm test
 * Style: zero-dep micro test framework, matching tests/listings.test.ts.
 * All time-dependent helpers are pinned to a fixed NOW for determinism.
 */

import {
  normalizeFirmDomain,
  firmNameFromDomain,
  parseDldDate,
  licenseStatus,
  daysUntilExpiry,
  isExpiringSoon,
  licenseTone,
  formatLicenseDate,
} from '../lib/rera';

// ---------- micro test framework (zero deps) ----------

type Case = { name: string; fn: () => void };
const cases: Case[] = [];
function test(name: string, fn: () => void) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Pin "today" so every licence-status assertion is deterministic regardless of
// when CI runs. Matches the project's current date for readability.
const NOW = new Date('2026-05-30T12:00:00Z');

// ---------- normalizeFirmDomain ----------

test('normalizeFirmDomain · strips www and lowercases', () => {
  eq(normalizeFirmDomain('www.famproperties.com'), 'famproperties.com');
});

test('normalizeFirmDomain · parses a full URL with path + scheme', () => {
  eq(normalizeFirmDomain('https://Savana.ae/agents/x'), 'savana.ae');
});

test('normalizeFirmDomain · adds implicit scheme for a bare host', () => {
  eq(normalizeFirmDomain('harbordubai.com'), 'harbordubai.com');
});

test('normalizeFirmDomain · null / empty / whitespace → null', () => {
  eq(normalizeFirmDomain(null), null);
  eq(normalizeFirmDomain(undefined), null);
  eq(normalizeFirmDomain(''), null);
  eq(normalizeFirmDomain('   '), null);
});

test('normalizeFirmDomain · garbage that cannot be a host → null', () => {
  // A value with a space inside becomes an unparseable URL host.
  eq(normalizeFirmDomain('not a url at all'), null);
});

// ---------- firmNameFromDomain ----------

test('firmNameFromDomain · curated override wins', () => {
  eq(firmNameFromDomain('famproperties.com'), 'fäm Properties');
  eq(firmNameFromDomain('bhomes.com'), 'Betterhomes');
});

test('firmNameFromDomain · humanises an unknown second-level domain', () => {
  eq(firmNameFromDomain('luxuryliving.ae'), 'Luxuryliving');
});

test('firmNameFromDomain · splits separators and title-cases each word', () => {
  eq(firmNameFromDomain('haus-haus.com'), 'Haus & Haus'); // override
  eq(firmNameFromDomain('blue-sky-realty.com'), 'Blue Sky Realty'); // humanised
});

test('firmNameFromDomain · null → null', () => {
  eq(firmNameFromDomain(null), null);
  eq(firmNameFromDomain(undefined), null);
});

// ---------- parseDldDate ----------

test('parseDldDate · DD-MM-YYYY → ISO', () => {
  eq(parseDldDate('02-01-2026'), '2026-01-02');
});

test('parseDldDate · DD/MM/YYYY → ISO', () => {
  eq(parseDldDate('9/3/2025'), '2025-03-09');
});

test('parseDldDate · already-ISO passes through (zero-padded)', () => {
  eq(parseDldDate('2026-1-5'), '2026-01-05');
});

test('parseDldDate · pads single-digit day/month', () => {
  eq(parseDldDate('5-7-2027'), '2027-07-05');
});

test('parseDldDate · unparseable / empty → null', () => {
  eq(parseDldDate(null), null);
  eq(parseDldDate(''), null);
  eq(parseDldDate('not-a-date'), null);
  eq(parseDldDate('13/40/2026'), '2026-40-13'); // shape-valid; DB DATE cast rejects bad values
});

// ---------- licenseStatus ----------

test('licenseStatus · future end date is active', () => {
  eq(licenseStatus('2027-01-01', NOW), 'active');
});

test('licenseStatus · past end date is expired', () => {
  eq(licenseStatus('2025-01-01', NOW), 'expired');
});

test('licenseStatus · expires today still reads active (day granularity)', () => {
  eq(licenseStatus('2026-05-30', NOW), 'active');
});

test('licenseStatus · null / unparseable → unknown', () => {
  eq(licenseStatus(null, NOW), 'unknown');
  eq(licenseStatus('garbage', NOW), 'unknown');
});

// ---------- daysUntilExpiry ----------

test('daysUntilExpiry · positive for a future date', () => {
  eq(daysUntilExpiry('2026-06-29', NOW), 30);
});

test('daysUntilExpiry · zero on the expiry day', () => {
  eq(daysUntilExpiry('2026-05-30', NOW), 0);
});

test('daysUntilExpiry · negative once expired', () => {
  eq(daysUntilExpiry('2026-05-20', NOW), -10);
});

test('daysUntilExpiry · null → null', () => {
  eq(daysUntilExpiry(null, NOW), null);
});

// ---------- isExpiringSoon ----------

test('isExpiringSoon · within default 90-day window', () => {
  eq(isExpiringSoon('2026-07-01', 90, NOW), true);
});

test('isExpiringSoon · beyond the window is false', () => {
  eq(isExpiringSoon('2027-01-01', 90, NOW), false);
});

test('isExpiringSoon · already expired is NOT "expiring soon"', () => {
  eq(isExpiringSoon('2026-05-01', 90, NOW), false);
});

// ---------- licenseTone (UI) ----------

test('licenseTone · active and far from expiry → active', () => {
  eq(licenseTone('2027-06-01', 90, NOW), 'active');
});

test('licenseTone · active but within 90 days → expiring', () => {
  eq(licenseTone('2026-06-15', 90, NOW), 'expiring');
});

test('licenseTone · past end date → expired', () => {
  eq(licenseTone('2025-12-31', 90, NOW), 'expired');
});

test('licenseTone · null → unknown', () => {
  eq(licenseTone(null, 90, NOW), 'unknown');
});

// ---------- formatLicenseDate ----------

test('formatLicenseDate · ISO → "2 Jan 2026" (UTC, no TZ drift)', () => {
  eq(formatLicenseDate('2026-01-02'), '2 Jan 2026');
});

test('formatLicenseDate · null / unparseable → null', () => {
  eq(formatLicenseDate(null), null);
  eq(formatLicenseDate('nope'), null);
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
