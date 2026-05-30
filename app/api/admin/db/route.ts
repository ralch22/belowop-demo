/**
 * One-shot DB admin endpoint — runs migrations and (optionally) seeds.
 *
 * This exists because Marketplace-managed env vars (Postgres) can't be
 * pulled to localhost via Vercel CLI, but they ARE available inside a
 * deployed function. So we run migrations from inside the deployment.
 *
 * Auth: Authorization: Bearer <ADMIN_TOKEN>
 * Usage:
 *   POST /api/admin/db?action=migrate        → applies all SQL files in db/migrations
 *   POST /api/admin/db?action=seed           → inserts data/listings.json
 *   POST /api/admin/db?action=status         → reports table sizes
 *   POST /api/admin/db?action=migrate-and-seed
 *   POST /api/admin/db?action=brokers-import → applies ONLY migration 0008, then
 *        upserts the RERA registry from the request body (raw CSV). The CSV is
 *        gitignored PII and is NOT bundled, so it's streamed up at import time.
 */
import { NextResponse } from 'next/server';
import { sql, query, pool } from '@/lib/db';
import { parseBrokersCsv, BROKER_COLUMNS, brokerRowToValues } from '@/lib/brokers-csv';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function runMigrations(): Promise<{ applied: string[] }> {
  const dir = join(process.cwd(), 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    await query(text);
    applied.push(f);
  }
  return { applied };
}

interface Seed {
  ref: string;
  project: string;
  developer: string;
  community: string;
  type: 'off_plan' | 'ready';
  beds: number | 'studio';
  sqft: number;
  currentPrice: number;
  originalPrice: number;
  listedAt: string;
  imageId: string;
  unitType?: string | null;
  bathrooms?: number | null;
  view?: string | null;
  floorPosition?: string | null;
  features?: string[] | null;
  handover?: string | null;
  paymentStatus?: string | null;
  plotSizeSqft?: number | null;
  buaSqft?: number | null;
  subLocation?: string | null;
  furnished?: string | null;
}

async function runSeed(): Promise<{ rows: number }> {
  const path = join(process.cwd(), 'data', 'listings.json');
  const rows: Seed[] = JSON.parse(readFileSync(path, 'utf8'));
  for (const r of rows) {
    const sourceUrl = `https://images.unsplash.com/photo-${r.imageId}?w=1200&q=80&auto=format&fit=crop`;
    const features = r.features ?? [];
    const featuresArray = `{${features.map((f) => '"' + f.replace(/"/g, '\\"') + '"').join(',')}}`;
    await sql`
      INSERT INTO listings (
        external_ref, project, developer, community, type, beds, sqft,
        current_price, original_price, source_image_urls, blob_image_urls,
        listed_at, raw,
        unit_type, bathrooms, features, view, floor_position, handover,
        payment_status, plot_size_sqft, bua_sqft, sub_location, furnished
      ) VALUES (
        ${r.ref}, ${r.project}, ${r.developer}, ${r.community}, ${r.type},
        ${String(r.beds)}, ${r.sqft}, ${r.currentPrice}, ${r.originalPrice},
        ${`{${sourceUrl}}`}, ${`{${sourceUrl}}`},
        ${r.listedAt}, ${JSON.stringify({ seeded: true })}::jsonb,
        ${r.unitType ?? null}, ${r.bathrooms ?? null}, ${featuresArray},
        ${r.view ?? null}, ${r.floorPosition ?? null}, ${r.handover ?? null},
        ${r.paymentStatus ?? null}, ${r.plotSizeSqft ?? null}, ${r.buaSqft ?? null},
        ${r.subLocation ?? null}, ${r.furnished ?? null}
      )
      ON CONFLICT (external_ref) DO UPDATE SET
        current_price  = EXCLUDED.current_price,
        original_price = EXCLUDED.original_price,
        unit_type      = EXCLUDED.unit_type,
        bathrooms      = EXCLUDED.bathrooms,
        features       = EXCLUDED.features,
        view           = EXCLUDED.view,
        floor_position = EXCLUDED.floor_position,
        handover       = EXCLUDED.handover,
        payment_status = EXCLUDED.payment_status,
        plot_size_sqft = EXCLUDED.plot_size_sqft,
        bua_sqft       = EXCLUDED.bua_sqft,
        sub_location   = EXCLUDED.sub_location,
        furnished      = EXCLUDED.furnished,
        updated_at     = NOW();
    `;
  }
  // Seed a baseline price_history row per listing if none exists.
  await sql`
    INSERT INTO price_history (listing_id, price, observed_at)
    SELECT id, current_price, listed_at FROM listings
    WHERE id NOT IN (SELECT listing_id FROM price_history);
  `;
  return { rows: rows.length };
}

/** Delete every listing whose raw payload was tagged {seeded: true} during the
 *  initial demo seed. Cascades to price_history + alert_events. */
async function wipeSeed(): Promise<{ deleted: number }> {
  const r = await sql<{ id: number }>`
    DELETE FROM listings
    WHERE raw->>'seeded' = 'true'
    RETURNING id;
  `;
  return { deleted: r.rowCount ?? 0 };
}

/** Delete leads created during testing — anything with phone +971500000000. */
async function wipeTestLeads(): Promise<{ deleted: number }> {
  const r = await sql<{ id: number }>`
    DELETE FROM leads WHERE phone = '+971500000000' RETURNING id;
  `;
  return { deleted: r.rowCount ?? 0 };
}

async function status() {
  const r = await sql<{ table: string; count: number }>`
    SELECT 'listings' AS table, COUNT(*)::int AS count FROM listings
    UNION ALL SELECT 'price_history', COUNT(*)::int FROM price_history
    UNION ALL SELECT 'leads', COUNT(*)::int FROM leads
    UNION ALL SELECT 'subscriptions', COUNT(*)::int FROM subscriptions
    UNION ALL SELECT 'alert_events', COUNT(*)::int FROM alert_events;
  `;
  return Object.fromEntries(r.rows.map((row) => [row.table, row.count]));
}

/**
 * Load the RERA broker registry from an uploaded CSV body.
 *
 * Applies ONLY migration 0008 first (idempotent CREATE TABLE / RLS) — never the
 * full migrate, which would re-run 0005's data UPDATEs against live listings.
 * Then batched-upserts every row so 8.7k brokers land well inside maxDuration.
 */
async function importBrokers(csv: string) {
  const ddl = readFileSync(join(process.cwd(), 'db', 'migrations', '0008_rera_brokers.sql'), 'utf8');
  await query(ddl);

  const { rows, total, skipped, missingColumns } = parseBrokersCsv(csv);
  if (missingColumns) throw new Error('CSV missing required columns broker_number / broker_name_en');
  if (rows.length === 0) throw new Error('no importable broker rows in request body');

  const cols = [...BROKER_COLUMNS];
  const updateSet = cols
    .filter((c) => c !== 'broker_number' && c !== 'source')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat('updated_at = NOW()')
    .join(', ');

  // 400 rows × 15 cols = 6000 params/statement — well under Postgres' 65535 cap.
  const BATCH = 400;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = slice.map((row) => {
      const vals = brokerRowToValues(row);
      const placeholders = vals.map((_, j) => `$${params.length + j + 1}`);
      params.push(...vals);
      return `(${placeholders.join(',')})`;
    });
    const text =
      `INSERT INTO rera_brokers (${cols.join(',')}) VALUES ${tuples.join(',')} ` +
      `ON CONFLICT (broker_number) DO UPDATE SET ${updateSet}`;
    const res = await pool.query(text, params);
    upserted += res.rowCount ?? slice.length;
  }

  const counts = await sql<{ total: number; active: number; expired: number; firms: number }>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE license_end >= CURRENT_DATE)::int AS active,
      COUNT(*) FILTER (WHERE license_end <  CURRENT_DATE)::int AS expired,
      COUNT(DISTINCT firm_domain)::int AS firms
    FROM rera_brokers WHERE hidden_at IS NULL;
  `;
  return { parsed: rows.length, total, skipped, upserted, counts: counts.rows[0] };
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const action = new URL(req.url).searchParams.get('action') ?? 'status';
  try {
    if (action === 'migrate') return NextResponse.json({ ok: true, ...(await runMigrations()) });
    if (action === 'seed') return NextResponse.json({ ok: true, ...(await runSeed()) });
    if (action === 'migrate-and-seed') {
      const m = await runMigrations();
      const s = await runSeed();
      const st = await status();
      return NextResponse.json({ ok: true, migrate: m, seed: s, status: st });
    }
    if (action === 'status') return NextResponse.json({ ok: true, status: await status() });
    if (action === 'brokers-import') {
      const csv = await req.text();
      if (!csv || csv.length < 50) {
        return NextResponse.json(
          { ok: false, error: 'empty body — POST the broker CSV as the raw request body' },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true, ...(await importBrokers(csv)) });
    }
    if (action === 'wipe-seed') {
      // Delete leads FIRST — leads.listing_id FKs to listings(id), and the
      // test leads point at seeded listings we're about to drop.
      const leadsWiped = await wipeTestLeads();
      const wiped = await wipeSeed();
      const st = await status();
      return NextResponse.json({ ok: true, wipe_test_leads: leadsWiped, wipe_seed: wiped, status: st });
    }
    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, stack: (e as Error).stack?.split('\n').slice(0, 5) }, { status: 500 });
  }
}
