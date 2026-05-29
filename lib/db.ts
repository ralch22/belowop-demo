import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import type { Listing } from './listings';

/**
 * Use @neondatabase/serverless directly, not @vercel/postgres.
 *
 * Why: @vercel/postgres' pool exhibits a read-after-write inconsistency on
 * sequential requests (a write returns success but the next request's read
 * doesn't see it). The direct Neon driver, talking to POSTGRES_URL_NON_POOLING
 * (the primary, no PgBouncer), behaves like a normal Postgres client and
 * doesn't have this issue.
 *
 * `sql` is a tagged-template function that returns rows (Neon's HTTP driver).
 * `query(text, [params?])` runs raw multi-statement SQL — used by the migration
 * runner.
 */
const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  '';

// Use WebSocket-based connections so we get a real, persistent Postgres
// session per pool checkout — the HTTP-fetch mode in @neondatabase/serverless
// can serve stale reads after a write because each call hits the load
// balancer independently.
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = false;

export const pool = new Pool({ connectionString });

type Primitive = string | number | boolean | null | undefined | Date;

/** Tagged-template SQL that returns { rows, rowCount }. */
export async function sql<T = unknown>(
  strings: TemplateStringsArray,
  ...values: Primitive[]
): Promise<{ rows: T[]; rowCount: number }> {
  // Convert tagged-template parts into parameterized SQL.
  let text = '';
  const params: unknown[] = [];
  strings.forEach((part, i) => {
    text += part;
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });
  const result = await pool.query(text, params);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
}

/** Run multi-statement SQL (migrations). */
export async function query(text: string): Promise<void> {
  await pool.query(text);
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

export interface ListingRow {
  id: number;
  external_ref: string;
  project: string;
  developer: string | null;
  community: string;
  type: 'off_plan' | 'ready';
  beds: string;
  sqft: number;
  current_price: number;
  original_price: number;
  blob_image_urls: string[];
  source_image_urls: string[];
  listed_at: string;
  unit_type: string | null;
  bathrooms: number | null;
  features: string[] | null;
  view: string | null;
  floor_position: string | null;
  handover: string | null;
  payment_status: string | null;
  plot_size_sqft: number | null;
  bua_sqft: number | null;
  sub_location: string | null;
  furnished: string | null;
}

/** Map a DB row into the shape the existing client components expect. */
export function rowToListing(r: ListingRow): Listing {
  // Prefer the Blob URL (our re-hosted WebP). Fall back to the source CDN URL
  // if image-sync hasn't run for this listing yet. Last resort: extract an
  // Unsplash photo ID from the URL so the legacy seed-style rendering works.
  const blobUrl = r.blob_image_urls?.[0] ?? null;
  const sourceUrl = r.source_image_urls?.[0] ?? null;
  const imageUrl = blobUrl ?? sourceUrl;
  // Extract Unsplash imageId only for backward-compat — most real listings
  // won't match this regex and that's fine (imageUrl is the canonical field).
  const m = imageUrl?.match(/photo-([a-z0-9-]+)/i);
  const imageId = m ? m[1] : '';
  return {
    ref: r.external_ref,
    project: r.project,
    unit: '',
    developer: r.developer ?? '',
    community: r.community,
    type: r.type,
    beds: r.beds === 'studio' ? 'studio' : Number(r.beds),
    sqft: r.sqft,
    currentPrice: Number(r.current_price),
    originalPrice: Number(r.original_price),
    listedAt: new Date(r.listed_at).toISOString(),
    imageId,
    imageUrl,
    unitType: r.unit_type,
    bathrooms: r.bathrooms,
    features: r.features,
    view: r.view,
    floorPosition: r.floor_position,
    handover: r.handover,
    paymentStatus: r.payment_status,
    plotSizeSqft: r.plot_size_sqft,
    buaSqft: r.bua_sqft,
    subLocation: r.sub_location,
    furnished: r.furnished,
  };
}

export async function fetchListings(limit = 200): Promise<Listing[]> {
  const result = await sql<ListingRow>`
    SELECT id, external_ref, project, developer, community, type, beds, sqft,
           current_price, original_price, blob_image_urls, source_image_urls, listed_at,
           unit_type, bathrooms, features, view, floor_position, handover,
           payment_status, plot_size_sqft, bua_sqft, sub_location, furnished
    FROM listings
    WHERE withdrawn_at IS NULL
    ORDER BY listed_at DESC
    LIMIT ${limit};
  `;
  return result.rows.map(rowToListing);
}

export async function fetchListingByRef(ref: string): Promise<Listing | null> {
  const result = await sql<ListingRow>`
    SELECT id, external_ref, project, developer, community, type, beds, sqft,
           current_price, original_price, blob_image_urls, source_image_urls, listed_at,
           unit_type, bathrooms, features, view, floor_position, handover,
           payment_status, plot_size_sqft, bua_sqft, sub_location, furnished
    FROM listings
    WHERE external_ref = ${ref}
    LIMIT 1;
  `;
  return result.rows[0] ? rowToListing(result.rows[0]) : null;
}

export async function insertLead(input: {
  listingRef: string;
  name: string;
  phone: string;
  message?: string;
  consent: boolean;
  ipHash?: string;
}): Promise<{ id: number; listingId: number | null }> {
  const listing = await sql<{ id: number }>`SELECT id FROM listings WHERE external_ref = ${input.listingRef} LIMIT 1;`;
  const listingId = listing.rows[0]?.id ?? null;
  const r = await sql<{ id: number }>`
    INSERT INTO leads (listing_id, name, phone, message, consent, ip_hash)
    VALUES (${listingId}, ${input.name}, ${input.phone}, ${input.message ?? null}, ${input.consent}, ${input.ipHash ?? null})
    RETURNING id;
  `;
  return { id: r.rows[0].id, listingId };
}

/**
 * Count how many leads this phone number has submitted within the last
 * `sinceHours` hours. Used as a privacy-compliant rate-limit fallback when
 * KV isn't configured (CLAUDE §7.9 — 3 leads / phone / 24h).
 *
 * We normalise the phone the same way the KV key does (strip whitespace)
 * before comparing, so the two code paths gate on the same identifier.
 */
export async function countRecentLeadsByPhone(phone: string, sinceHours: number): Promise<number> {
  const normalised = phone.replace(/\s+/g, '');
  const r = await sql<{ n: number }>`
    SELECT COUNT(*)::int AS n
    FROM leads
    WHERE REGEXP_REPLACE(phone, '\\s+', '', 'g') = ${normalised}
      AND captured_at >= NOW() - (${sinceHours} || ' hours')::interval;
  `;
  return r.rows[0]?.n ?? 0;
}

export async function markLeadNotified(id: number, error?: string): Promise<void> {
  if (error) {
    await sql`UPDATE leads SET notify_error = ${error} WHERE id = ${id};`;
  } else {
    await sql`UPDATE leads SET notified_at = NOW() WHERE id = ${id};`;
  }
}

/** Upsert a listing from the Apify scraper. Returns { isNew, priceDropped, listingId }. */
export async function upsertScrapedListing(input: {
  externalRef: string;
  project: string;
  developer: string | null;
  community: string;
  type: 'off_plan' | 'ready';
  beds: string;
  sqft: number;
  currentPrice: number;
  originalPrice: number | null;
  sourceImageUrls: string[];
  listedAt: string;
  raw: unknown;
  // Broker-template fields (Variables.pdf):
  unitType?: string | null;
  bathrooms?: number | null;
  features?: string[];
  view?: string | null;
  floorPosition?: string | null;
  handover?: string | null;
  paymentStatus?: string | null;
  plotSizeSqft?: number | null;
  buaSqft?: number | null;
  subLocation?: string | null;
  furnished?: string | null;
}): Promise<{ listingId: number; isNew: boolean; previousPrice: number | null; priceDropped: boolean }> {
  const existing = await sql<{ id: number; current_price: number }>`
    SELECT id, current_price FROM listings WHERE external_ref = ${input.externalRef} LIMIT 1;
  `;
  const previousPrice = existing.rows[0] ? Number(existing.rows[0].current_price) : null;
  const isNew = !existing.rows[0];
  const priceDropped = previousPrice !== null && input.currentPrice < previousPrice;

  const features = input.features ?? [];
  const featuresArray = `{${features.map((f) => '"' + f.replace(/"/g, '\\"') + '"').join(',')}}`;
  const upsert = await sql<{ id: number }>`
    INSERT INTO listings (
      external_ref, project, developer, community, type, beds, sqft,
      current_price, original_price, source_image_urls, listed_at, raw,
      unit_type, bathrooms, features, view, floor_position, handover,
      payment_status, plot_size_sqft, bua_sqft, sub_location, furnished
    ) VALUES (
      ${input.externalRef}, ${input.project}, ${input.developer}, ${input.community},
      ${input.type}, ${input.beds}, ${input.sqft}, ${input.currentPrice}, ${input.originalPrice},
      ${`{${input.sourceImageUrls.join(',')}}`}, ${input.listedAt}, ${JSON.stringify(input.raw)}::jsonb,
      ${input.unitType ?? null}, ${input.bathrooms ?? null}, ${featuresArray},
      ${input.view ?? null}, ${input.floorPosition ?? null}, ${input.handover ?? null},
      ${input.paymentStatus ?? null}, ${input.plotSizeSqft ?? null}, ${input.buaSqft ?? null},
      ${input.subLocation ?? null}, ${input.furnished ?? null}
    )
    ON CONFLICT (external_ref) DO UPDATE SET
      project           = EXCLUDED.project,
      developer         = EXCLUDED.developer,
      community         = EXCLUDED.community,
      type              = EXCLUDED.type,
      beds              = EXCLUDED.beds,
      sqft              = EXCLUDED.sqft,
      current_price     = EXCLUDED.current_price,
      original_price    = EXCLUDED.original_price,
      source_image_urls = EXCLUDED.source_image_urls,
      listed_at         = EXCLUDED.listed_at,
      updated_at        = NOW(),
      withdrawn_at      = NULL,
      raw               = EXCLUDED.raw,
      unit_type         = COALESCE(EXCLUDED.unit_type, listings.unit_type),
      bathrooms         = COALESCE(EXCLUDED.bathrooms, listings.bathrooms),
      features          = CASE WHEN array_length(EXCLUDED.features, 1) > 0 THEN EXCLUDED.features ELSE listings.features END,
      view              = COALESCE(EXCLUDED.view, listings.view),
      floor_position    = COALESCE(EXCLUDED.floor_position, listings.floor_position),
      handover          = COALESCE(EXCLUDED.handover, listings.handover),
      payment_status    = COALESCE(EXCLUDED.payment_status, listings.payment_status),
      plot_size_sqft    = COALESCE(EXCLUDED.plot_size_sqft, listings.plot_size_sqft),
      bua_sqft          = COALESCE(EXCLUDED.bua_sqft, listings.bua_sqft),
      sub_location      = COALESCE(EXCLUDED.sub_location, listings.sub_location),
      furnished         = COALESCE(EXCLUDED.furnished, listings.furnished)
    RETURNING id;
  `;
  const listingId = upsert.rows[0].id;

  // Always write a price_history row so the diff has a sample.
  await sql`INSERT INTO price_history (listing_id, price) VALUES (${listingId}, ${input.currentPrice});`;

  if (isNew || priceDropped) {
    await sql`
      INSERT INTO alert_events (listing_id, kind, prev_price, new_price, drop_pct)
      VALUES (
        ${listingId},
        ${isNew ? 'new_listing' : 'price_drop'},
        ${previousPrice},
        ${input.currentPrice},
        ${input.originalPrice ? ((input.currentPrice - input.originalPrice) / input.originalPrice) * 100 : null}
      );
    `;
  }

  return { listingId, isNew, previousPrice, priceDropped };
}

export async function listingsNeedingBlobSync(limit = 20): Promise<{ id: number; external_ref: string; source_image_urls: string[] }[]> {
  const r = await sql<{ id: number; external_ref: string; source_image_urls: string[] }>`
    SELECT id, external_ref, source_image_urls
    FROM listings
    WHERE blob_synced_at IS NULL
      AND withdrawn_at IS NULL
      AND COALESCE(array_length(source_image_urls, 1), 0) > 0
    ORDER BY listed_at DESC
    LIMIT ${limit};
  `;
  return r.rows;
}

export async function setBlobImages(listingId: number, urls: string[]): Promise<void> {
  const arr = `{${urls.map((u) => '"' + u.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',')}}`;
  // Use ::text[] cast to be unambiguous about the target type.
  const result = await sql`
    UPDATE listings
    SET blob_image_urls = ${arr}::text[], blob_synced_at = NOW()
    WHERE id = ${listingId}
    RETURNING id, blob_synced_at::text;
  `;
  if (!result.rows[0]) {
    throw new Error(`setBlobImages: no rows updated for listing ${listingId} (arr=${arr.slice(0, 80)}...)`);
  }
}

export async function pendingAlertEvents(limit = 50): Promise<
  { id: number; kind: 'new_listing' | 'price_drop'; listing_id: number; new_price: number; prev_price: number | null; drop_pct: number }[]
> {
  const r = await sql<{ id: number; kind: 'new_listing' | 'price_drop'; listing_id: number; new_price: number; prev_price: number | null; drop_pct: number }>`
    SELECT id, kind, listing_id, new_price, prev_price, drop_pct
    FROM alert_events
    WHERE dispatched_at IS NULL
    ORDER BY created_at
    LIMIT ${limit};
  `;
  return r.rows;
}

export async function markAlertDispatched(id: number, error?: string): Promise<void> {
  if (error) {
    await sql`UPDATE alert_events SET dispatch_error = ${error} WHERE id = ${id};`;
  } else {
    await sql`UPDATE alert_events SET dispatched_at = NOW() WHERE id = ${id};`;
  }
}

export async function activeSubscriptions(): Promise<{ id: number; channel: 'whatsapp' | 'telegram' | 'email'; contact: string; filters: Record<string, unknown> }[]> {
  const r = await sql<{ id: number; channel: 'whatsapp' | 'telegram' | 'email'; contact: string; filters: Record<string, unknown> }>`
    SELECT id, channel, contact, filters FROM subscriptions WHERE status = 'active';
  `;
  return r.rows;
}

export async function createPendingSubscription(input: {
  channel: 'whatsapp' | 'telegram' | 'email';
  contact: string;
  filters: Record<string, unknown>;
  confirmToken: string;
}): Promise<void> {
  await sql`
    INSERT INTO subscriptions (channel, contact, filters, confirm_token, status)
    VALUES (${input.channel}, ${input.contact}, ${JSON.stringify(input.filters)}::jsonb, ${input.confirmToken}, 'pending')
    ON CONFLICT (channel, contact) DO UPDATE SET
      filters       = EXCLUDED.filters,
      confirm_token = EXCLUDED.confirm_token,
      status        = 'pending',
      created_at    = NOW(),
      unsubscribed_at = NULL;
  `;
}

export async function activateSubscription(token: string): Promise<boolean> {
  const r = await sql`
    UPDATE subscriptions SET status = 'active', confirmed_at = NOW()
    WHERE confirm_token = ${token} AND status = 'pending'
    RETURNING id;
  `;
  return r.rowCount! > 0;
}

export async function unsubscribe(token: string): Promise<boolean> {
  const r = await sql`
    UPDATE subscriptions SET status = 'unsubscribed', unsubscribed_at = NOW()
    WHERE confirm_token = ${token}
    RETURNING id;
  `;
  return r.rowCount! > 0;
}

// ---------------------------------------------------------------------------
// Ingestion observability (migration 0003)
//
// Every Apify webhook call records its lifecycle here. Read by:
//   - /admin/pipeline           (task #67, the dashboard)
//   - /api/cron/watchdog        (task #68, the alarm)
//   - v_ingestion_freshness DB  (the "is data flowing?" headline)
// ---------------------------------------------------------------------------

export interface IngestionRunStats {
  items_received: number;
  items_inserted: number;
  items_updated: number;
  items_unchanged: number;
  items_withdrawn: number;
  items_errored: number;
}

export async function startIngestionRun(input: {
  runId: string;
  datasetId: string;
  actorName?: string;
}): Promise<number> {
  // Idempotent: if Apify retries the webhook for the same run_id we just
  // bump the started_at + reset stats — caller re-runs the upsert loop.
  const r = await sql<{ id: number }>`
    INSERT INTO ingestion_runs (run_id, dataset_id, actor_name, started_at, status)
    VALUES (${input.runId}, ${input.datasetId}, ${input.actorName ?? null}, NOW(), 'running')
    ON CONFLICT (run_id) DO UPDATE SET
      dataset_id = EXCLUDED.dataset_id,
      actor_name = COALESCE(EXCLUDED.actor_name, ingestion_runs.actor_name),
      started_at = NOW(),
      status     = 'running',
      error_text = NULL,
      items_received  = 0,
      items_inserted  = 0,
      items_updated   = 0,
      items_unchanged = 0,
      items_withdrawn = 0,
      items_errored   = 0
    RETURNING id;
  `;
  return r.rows[0].id;
}

export async function completeIngestionRun(
  id: number,
  stats: IngestionRunStats & { rawStats?: Record<string, unknown> },
  status: 'succeeded' | 'failed' | 'partial' = 'succeeded',
  errorText?: string,
): Promise<void> {
  const raw = stats.rawStats ?? {};
  await sql`
    UPDATE ingestion_runs SET
      completed_at    = NOW(),
      items_received  = ${stats.items_received},
      items_inserted  = ${stats.items_inserted},
      items_updated   = ${stats.items_updated},
      items_unchanged = ${stats.items_unchanged},
      items_withdrawn = ${stats.items_withdrawn},
      items_errored   = ${stats.items_errored},
      status          = ${status},
      error_text      = ${errorText ?? null},
      raw_stats       = ${JSON.stringify(raw)}::jsonb
    WHERE id = ${id};
  `;
}

export async function failIngestionRun(id: number, errorText: string): Promise<void> {
  await sql`
    UPDATE ingestion_runs SET
      completed_at = NOW(),
      status       = 'failed',
      error_text   = ${errorText}
    WHERE id = ${id};
  `;
}

export interface IngestionFreshness {
  last_run_started_at: string | null;
  last_success_at: string | null;
  runs_24h: number;
  successes_24h: number;
  last_new_listing_at: string | null;
  new_listings_24h: number;
  updates_24h: number;
  withdrawn_24h: number;
  active_listings_total: number;
}

export async function ingestionFreshness(): Promise<IngestionFreshness> {
  const r = await sql<IngestionFreshness>`SELECT * FROM v_ingestion_freshness;`;
  return r.rows[0];
}

export interface IngestionRunRow {
  id: number;
  run_id: string;
  dataset_id: string;
  actor_name: string | null;
  started_at: string;
  completed_at: string | null;
  items_received: number;
  items_inserted: number;
  items_updated: number;
  items_unchanged: number;
  items_withdrawn: number;
  items_errored: number;
  status: 'running' | 'succeeded' | 'failed' | 'partial';
  error_text: string | null;
}

export async function recentIngestionRuns(limit = 50): Promise<IngestionRunRow[]> {
  const r = await sql<IngestionRunRow>`
    SELECT id, run_id, dataset_id, actor_name, started_at::text, completed_at::text,
           items_received, items_inserted, items_updated, items_unchanged,
           items_withdrawn, items_errored, status, error_text
    FROM ingestion_runs
    ORDER BY started_at DESC
    LIMIT ${limit};
  `;
  return r.rows;
}

// ---------------------------------------------------------------------------
// Stale-listing pruning (migration 0004, task #66)
//
// Apify webhook calls these in sequence at the end of each run:
//   markSeen(externalRefs)         — last_seen_at=NOW(), miss_count=0
//   incrementMissesAndPrune()      — miss_count++; withdraw at >=2
// ---------------------------------------------------------------------------

/**
 * Mark a batch of listings as seen in the current run. Resets miss_count to 0
 * and stamps last_seen_at. No-op for refs that don't exist (the matching
 * upsert call earlier in the pipeline created them).
 */
export async function markListingsSeen(externalRefs: string[]): Promise<number> {
  if (externalRefs.length === 0) return 0;
  // Postgres array literal with double-quoted strings.
  const arr = `{${externalRefs.map((r) => '"' + r.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',')}}`;
  const r = await sql`
    UPDATE listings
    SET miss_count = 0, last_seen_at = NOW()
    WHERE external_ref = ANY(${arr}::text[])
    RETURNING id;
  `;
  return r.rowCount ?? 0;
}

/**
 * Increment miss_count for active listings that were NOT in the latest seen-set.
 * Any listing reaching miss_count >= 2 is marked withdrawn and a 'withdrawn'
 * alert_event is queued.
 *
 * Returns { incremented, withdrawn } — incremented = listings whose counter
 * went up but didn't yet cross the threshold; withdrawn = listings just marked
 * stale.
 *
 * IMPORTANT: only call this when the run has confirmed-successful items.
 * A run that returns 0 items must NOT trigger pruning — that's the watchdog
 * cron's job, and the right response is "alarm", not "withdraw everything".
 */
export async function incrementMissesAndPrune(seenRefs: string[]): Promise<{
  incremented: number;
  withdrawn: number;
}> {
  if (seenRefs.length === 0) {
    return { incremented: 0, withdrawn: 0 };
  }
  const arr = `{${seenRefs.map((r) => '"' + r.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',')}}`;

  // Step 1: increment miss_count for active listings we did NOT see.
  // Run BEFORE the threshold check so this run's incremented rows are eligible.
  const inc = await sql<{ id: number }>`
    UPDATE listings
    SET miss_count = miss_count + 1
    WHERE withdrawn_at IS NULL
      AND NOT (external_ref = ANY(${arr}::text[]))
    RETURNING id;
  `;

  // Step 2: withdraw anything that just crossed the 2-miss threshold.
  // Emit a 'withdrawn' alert_event for each so downstream channels can notify.
  const w = await sql<{ id: number; external_ref: string; current_price: number }>`
    UPDATE listings
    SET withdrawn_at = NOW()
    WHERE withdrawn_at IS NULL AND miss_count >= 2
    RETURNING id, external_ref, current_price;
  `;
  for (const row of w.rows) {
    await sql`
      INSERT INTO alert_events (listing_id, kind, prev_price, new_price, drop_pct)
      VALUES (${row.id}, 'withdrawn', ${row.current_price}, ${row.current_price}, 0);
    `;
  }

  return {
    incremented: (inc.rowCount ?? 0) - (w.rowCount ?? 0),
    withdrawn: w.rowCount ?? 0,
  };
}

export interface PruningRisk {
  one_miss: number;
  would_withdraw: number;
  never_re_seen: number;
  fresh_24h: number;
}

export async function pruningRisk(): Promise<PruningRisk> {
  const r = await sql<PruningRisk>`SELECT * FROM v_listings_pruning_risk;`;
  return r.rows[0];
}
