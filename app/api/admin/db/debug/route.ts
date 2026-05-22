/**
 * Diagnostic endpoint for the image-sync stall.
 * Returns counts split by blob_synced_at status.
 */
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

function auth(req: Request): boolean {
  const exp = process.env.ADMIN_TOKEN;
  if (!exp) return false;
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got); const b = Buffer.from(exp);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function probeInsert() {
  const phone = `+999${Date.now()}`;
  await sql`INSERT INTO leads (name, phone, consent) VALUES ('probe', ${phone}, true);`;
  const c = await sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM leads;`;
  return { phone, count_now: c.rows[0].n };
}

async function probeSentinel() {
  // UPDATE listing id=60 with a known sentinel timestamp, then re-read.
  const sentinel = new Date().toISOString();
  const upd = await sql<{ id: number; blob_synced_at: string }>`
    UPDATE listings SET blob_synced_at = ${sentinel}::timestamptz
    WHERE id = 60 RETURNING id, blob_synced_at::text;
  `;
  // Immediately re-read same row in a fresh query
  const reread = await sql<{ id: number; blob_synced_at: string | null }>`
    SELECT id, blob_synced_at::text FROM listings WHERE id = 60;
  `;
  return { sentinel, updateRowCount: upd.rowCount, updateReturning: upd.rows[0], rereadInSameRequest: reread.rows[0] };
}

async function probeSentinelRead() {
  // Just read id=60 — separate request from the UPDATE.
  const r = await sql<{ id: number; blob_synced_at: string | null }>`
    SELECT id, blob_synced_at::text FROM listings WHERE id = 60;
  `;
  return r.rows[0];
}

async function probeEnv() {
  // Which connection string is the pool actually using?
  const urls = {
    POSTGRES_URL: process.env.POSTGRES_URL ? `${process.env.POSTGRES_URL.slice(0, 30)}...${process.env.POSTGRES_URL.slice(-20)}` : null,
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING ? `${process.env.POSTGRES_URL_NON_POOLING.slice(0, 30)}...${process.env.POSTGRES_URL_NON_POOLING.slice(-20)}` : null,
    DATABASE_URL: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.slice(0, 30)}...${process.env.DATABASE_URL.slice(-20)}` : null,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED ? `${process.env.DATABASE_URL_UNPOOLED.slice(0, 30)}...${process.env.DATABASE_URL_UNPOOLED.slice(-20)}` : null,
  };
  // Run a query and see what database we're connected to.
  const r = await sql<{ db: string; user: string; ts: string }>`
    SELECT current_database()::text AS db, current_user::text AS user, NOW()::text AS ts;
  `;
  return { urls, conn: r.rows[0] };
}

async function probeUpdate() {
  // Isolation test: pick the first not-synced listing, run a minimal UPDATE
  // that just sets blob_synced_at = NOW() (no blob_image_urls). Returns the
  // listing id, RETURNING result, and a follow-up SELECT to verify.
  const pick = await sql<{ id: number; external_ref: string }>`
    SELECT id, external_ref FROM listings
    WHERE blob_synced_at IS NULL LIMIT 1;
  `;
  if (!pick.rows[0]) return { picked: null };
  const id = pick.rows[0].id;
  const update = await sql<{ id: number; blob_synced_at: string }>`
    UPDATE listings SET blob_synced_at = NOW()
    WHERE id = ${id} RETURNING id, blob_synced_at::text;
  `;
  const followup = await sql<{ id: number; blob_synced_at: string | null }>`
    SELECT id, blob_synced_at::text FROM listings WHERE id = ${id};
  `;
  return {
    picked: { id, external_ref: pick.rows[0].external_ref },
    update_returning: update.rows[0],
    followup_select: followup.rows[0],
    rowCount: update.rowCount,
    sameTransaction: update.rows[0]?.blob_synced_at === followup.rows[0]?.blob_synced_at,
  };
}

export async function GET(req: Request) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const probe = new URL(req.url).searchParams.get('probe');
  if (probe === '1') return NextResponse.json({ ok: true, probe: await probeUpdate() });
  if (probe === 'insert') return NextResponse.json({ ok: true, probe: await probeInsert() });
  if (probe === 'env') return NextResponse.json({ ok: true, probe: await probeEnv() });
  if (probe === 'sentinel') return NextResponse.json({ ok: true, probe: await probeSentinel() });
  if (probe === 'sentinel-read') return NextResponse.json({ ok: true, probe: await probeSentinelRead() });
  const r = await sql<{ synced: number; not_synced: number; with_blob_urls: number; with_source_urls: number; total: number }>`
    SELECT
      COUNT(*) FILTER (WHERE blob_synced_at IS NOT NULL)::int AS synced,
      COUNT(*) FILTER (WHERE blob_synced_at IS NULL)::int AS not_synced,
      COUNT(*) FILTER (WHERE COALESCE(array_length(blob_image_urls, 1), 0) > 0)::int AS with_blob_urls,
      COUNT(*) FILTER (WHERE COALESCE(array_length(source_image_urls, 1), 0) > 0)::int AS with_source_urls,
      COUNT(*)::int AS total
    FROM listings;
  `;
  const sample = await sql<{ external_ref: string; blob_synced_at: string | null; blob_count: number; source_count: number }>`
    SELECT external_ref, blob_synced_at::text,
           COALESCE(array_length(blob_image_urls, 1), 0) AS blob_count,
           COALESCE(array_length(source_image_urls, 1), 0) AS source_count
    FROM listings
    ORDER BY listed_at DESC
    LIMIT 5;
  `;
  return NextResponse.json({ ok: true, counts: r.rows[0], sample: sample.rows });
}
