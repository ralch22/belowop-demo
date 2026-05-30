/**
 * Tests for lib/dub — the Dub (dub.co) link-shortening client.
 *
 * Network is NOT exercised (no live API in CI). We test the pure request
 * shaping (destination URL, upsert body, analytics URL, externalId form) and
 * the config gate: when DUB_API_KEY is unset the client must short-circuit to a
 * graceful fallback (shortenListing → null) WITHOUT making a network call, so an
 * alert send never breaks because Dub is unconfigured or down.
 *
 * PRIVACY assertion: only the opaque id ever reaches Dub — never a raw PF ref.
 *
 * Run: npm test  (or: npm run test:dub)
 * Style: zero-dep micro framework (async-aware), matching tests/rera.test.ts.
 */

import {
  isDubConfigured,
  listingDestination,
  externalIdQuery,
  buildUpsertBody,
  analyticsUrl,
  shortenListing,
  getListingClicks,
} from '../lib/dub';

// ---------- micro test framework (zero deps, async-aware) ----------

type Case = { name: string; fn: () => void | Promise<void> };
const cases: Case[] = [];
function test(name: string, fn: () => void | Promise<void>) { cases.push({ name, fn }); }
function eq<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'eq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg ?? 'expected truthy');
}

// Ensure a clean, unconfigured baseline for the gate tests.
delete process.env.DUB_API_KEY;
delete process.env.DUB_DOMAIN;

// ---------- listingDestination ----------

test('listingDestination builds the opaque deep link', () => {
  eq(
    listingDestination('https://belowop-demo.vercel.app', 'u-abc123'),
    'https://belowop-demo.vercel.app/?inquire=u-abc123',
  );
});

test('listingDestination strips trailing slashes on the base', () => {
  eq(
    listingDestination('https://belowop-demo.vercel.app///', 'u-xyz'),
    'https://belowop-demo.vercel.app/?inquire=u-xyz',
  );
});

test('listingDestination URL-encodes the opaque id', () => {
  // Opaque ids are u-[hex] in practice, but never trust the input shape.
  ok(listingDestination('https://x.co', 'u a/b').includes('inquire=u%20a%2Fb'));
});

// ---------- externalIdQuery ----------

test('externalIdQuery prefixes with ext_', () => {
  eq(externalIdQuery('u-abc123'), 'ext_u-abc123');
});

// ---------- buildUpsertBody ----------

test('buildUpsertBody sets url + externalId, omits title/domain when absent', () => {
  const body = buildUpsertBody({ webBase: 'https://belowop-demo.vercel.app', opaqueId: 'u-abc123' });
  eq(body.url, 'https://belowop-demo.vercel.app/?inquire=u-abc123');
  eq(body.externalId, 'u-abc123');
  eq(body.title, undefined);
  eq(body.domain, undefined);
});

test('buildUpsertBody includes title when provided and domain from env', () => {
  process.env.DUB_DOMAIN = 'go.belowop.com';
  const body = buildUpsertBody({ webBase: 'https://x.co', opaqueId: 'u-9', title: 'Marina Vista' });
  eq(body.title, 'Marina Vista');
  eq(body.domain, 'go.belowop.com');
  delete process.env.DUB_DOMAIN;
});

test('PRIVACY: upsert body never carries a raw PF ref, only the opaque id', () => {
  const rawRef = 'PF-12345678';
  // The caller is responsible for hashing; the client only ever sees opaqueId.
  const body = buildUpsertBody({ webBase: 'https://x.co', opaqueId: 'u-deadbeef', title: 'Some Project' });
  const serialized = JSON.stringify(body);
  ok(!serialized.includes(rawRef), 'raw ref must not appear');
  ok(!serialized.includes('PF-'), 'no PF- token anywhere in the body');
  ok(serialized.includes('u-deadbeef'), 'opaque id present');
});

// ---------- analyticsUrl ----------

test('analyticsUrl targets the clicks count for one listing', () => {
  const u = analyticsUrl('u-abc123');
  ok(u.startsWith('https://api.dub.co/analytics?'), 'hits the analytics endpoint');
  ok(u.includes('event=clicks'), 'event=clicks');
  ok(u.includes('groupBy=count'), 'groupBy=count');
  ok(u.includes('interval=all'), 'default interval=all');
  ok(u.includes('externalId=ext_u-abc123'), 'externalId is ext_-prefixed');
});

test('analyticsUrl honors a custom interval', () => {
  ok(analyticsUrl('u-1', '7d').includes('interval=7d'));
});

// ---------- config gate ----------

test('isDubConfigured reflects DUB_API_KEY presence', () => {
  delete process.env.DUB_API_KEY;
  eq(isDubConfigured(), false);
  process.env.DUB_API_KEY = 'dub_test';
  eq(isDubConfigured(), true);
  delete process.env.DUB_API_KEY;
});

test('shortenListing returns null when unconfigured (no network)', async () => {
  delete process.env.DUB_API_KEY;
  const r = await shortenListing({ webBase: 'https://x.co', opaqueId: 'u-1' });
  eq(r, null);
});

test('getListingClicks returns ok:false when unconfigured (no network)', async () => {
  delete process.env.DUB_API_KEY;
  const r = await getListingClicks('u-1');
  eq(r.ok, false);
  ok((r.error ?? '').includes('not configured'));
});

// ---------- runner (async-aware) ----------

(async () => {
  let passed = 0;
  let failed = 0;
  const fails: { name: string; err: string }[] = [];
  for (const c of cases) {
    try {
      await c.fn();
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
})();
