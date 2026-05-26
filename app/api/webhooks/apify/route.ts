/**
 * Apify → Below OP ingest webhook.
 *
 * Consumes Apify's native `run.succeeded` webhook for the
 * `azzouzana/propertyfinder-ads-search-results-pages-scraper` actor.
 *
 * Apify configuration:
 *   Event: ACTOR.RUN.SUCCEEDED
 *   URL:   https://belowop-demo.vercel.app/api/webhooks/apify
 *   Headers: Authorization: Bearer ${APIFY_WEBHOOK_SECRET}
 *   Payload template (Apify default works — we need `eventData.actorRunId`
 *   and `resource.defaultDatasetId`).
 *
 * Required env on Vercel:
 *   APIFY_WEBHOOK_SECRET  (shared secret in the Authorization header)
 *   APIFY_TOKEN           (read access to fetch dataset items via API)
 *   POSTGRES_URL
 *
 * Flow:
 *   1. Verify Authorization header
 *   2. Read runId + datasetId from the Apify payload
 *   3. Fetch dataset items via Apify API
 *   4. Map each azzouzana item → our DB schema (with OP parsed from description)
 *   5. Upsert + queue alert events
 */

import { NextResponse } from 'next/server';
import {
  upsertScrapedListing,
  isDbConfigured,
  startIngestionRun,
  completeIngestionRun,
  failIngestionRun,
  markListingsSeen,
  incrementMissesAndPrune,
} from '@/lib/db';
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
} from '@/lib/description-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Internal scraped-item shape (azzouzana's original schema)
//
// All scrapers normalise into this interface before downstream parsing. See
// `normaliseShahidirfan()` below for the shahidirfan → azzouzana translation.
// ---------------------------------------------------------------------------

interface AzzouzanaItem {
  id?: string | number;
  reference?: string;
  property_type?: string;
  bedrooms?: string;
  bedrooms_value?: number | string;
  bathrooms?: string;
  bathrooms_value?: number | string;
  size?: { value?: number; unit?: string } | number;
  built_up_area?: number;
  plot_size?: number;
  completion_status?: string; // "off_plan" / "completed" / "ready"
  furnished?: string;
  amenities?: string[];      // short codes like "BA", "MR"
  amenity_names?: string[];  // human-readable: "Balcony", "Maids Room"
  price?: { value?: number; currency?: string; period?: string };
  images?: { small?: string; medium?: string; full?: string }[];
  listed_date?: string;
  description?: string;
  title?: string;
  location?: { full_name?: string; name?: string; path_name?: string };
  location_tree?: { name?: string; type?: string; level?: string }[];
  broker?: { name?: string; company?: string };
  agent?: { name?: string };
  share_url?: string;
}

// ---------------------------------------------------------------------------
// shahidirfan/Propertyfinder-Scraper output schema (subset)
//
// shahidirfan delivers richer data than azzouzana but in a flatter, camelCase
// shape. Detection key: presence of `propertyType` (camelCase) — azzouzana
// uses `property_type` (snake_case).
// ---------------------------------------------------------------------------

interface ShahidirfanItem {
  id?: string;
  listingId?: string;
  reference?: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  location?: string;
  locationPath?: string;       // "1.9754.9755.12582.17098" (dotted IDs)
  locationPathName?: string;   // "Dubai, Dubai Harbour, Emaar Beachfront, Seapoint"
  locationSlug?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;               // in areaUnit (usually sqft)
  areaUnit?: string;           // "sqft" | "sqm"
  completionStatus?: string;
  furnished?: string;
  propertyType?: string;       // "Apartment" | "Villa" etc.
  amenities?: string[];        // short codes
  amenityNames?: string[];     // human-readable
  images?: string[];           // direct URL list (no nested object)
  listedDate?: string;
  rera?: string;
  agentName?: string;
  brokerName?: string;
  detailsUrl?: string;
  url?: string;
}

function isShahidirfan(item: unknown): item is ShahidirfanItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    ('propertyType' in item || 'locationPathName' in item || 'listedDate' in item)
  );
}

/**
 * Translate a shahidirfan-shaped item to the AzzouzanaItem shape we already
 * parse downstream. Lossy in places (we ignore agentName/brokerName/etc.) but
 * preserves everything the existing parsers need.
 *
 * Built 2026-05-26 after azzouzana stopped producing items and we switched to
 * shahidirfan/Propertyfinder-Scraper. See docs/APIFY-PIPELINE-STATE.md.
 */
function normaliseShahidirfan(s: ShahidirfanItem): AzzouzanaItem {
  // Build location_tree[] from "Dubai, Dubai Harbour, Emaar Beachfront, …"
  const tree =
    s.locationPathName
      ?.split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name, i) => ({ name, level: String(i), type: undefined })) ?? [];

  // Build location.full_name from `location` (which is e.g. "Tower 2, Building, Community, City")
  const locationName = s.location?.split(',')?.[0]?.trim();

  return {
    id: s.id,
    reference: s.reference,
    property_type: s.propertyType,
    bedrooms: s.bedrooms != null ? String(s.bedrooms) : undefined,
    bedrooms_value: s.bedrooms,
    bathrooms: s.bathrooms != null ? String(s.bathrooms) : undefined,
    bathrooms_value: s.bathrooms,
    size:
      s.area != null
        ? { value: s.area, unit: s.areaUnit ?? 'sqft' }
        : undefined,
    built_up_area: s.areaUnit === 'sqft' ? s.area : undefined,
    completion_status: s.completionStatus,
    furnished: s.furnished,
    amenities: s.amenities,
    amenity_names: s.amenityNames,
    price:
      s.price != null
        ? { value: s.price, currency: s.currency ?? 'AED' }
        : undefined,
    // shahidirfan returns image URLs as a flat array of strings; azzouzana
    // returns [{small,medium,full}]. Wrap as {full: …} so mapImages() works.
    images: s.images?.map((url) => ({ full: url })),
    listed_date: s.listedDate,
    description: s.description,
    title: s.title,
    location: {
      full_name: s.location,
      name: locationName,
      path_name: s.locationPathName,
    },
    location_tree: tree,
    broker: s.brokerName ? { name: s.brokerName, company: s.brokerName } : undefined,
    agent: s.agentName ? { name: s.agentName } : undefined,
    share_url: s.detailsUrl ?? s.url,
  };
}

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

function mapBeds(item: AzzouzanaItem): string {
  const raw = (item.bedrooms ?? item.bedrooms_value ?? '').toString().toLowerCase();
  if (!raw || raw === '0' || raw.includes('studio')) return 'studio';
  const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  if (!isFinite(n)) return '1';
  if (n >= 4) return '4+';
  return String(n);
}

function mapSqft(item: AzzouzanaItem): number {
  // Prefer built_up_area (the actual area), fall back to size.value
  if (typeof item.built_up_area === 'number' && item.built_up_area > 0) return Math.round(item.built_up_area);
  if (typeof item.size === 'number') return Math.round(item.size);
  const value = item.size?.value;
  if (!value) return 0;
  const unit = item.size?.unit?.toLowerCase() ?? 'sqft';
  if (unit.includes('sqm') || (unit === 'm') || unit.includes('m²') || unit.includes('m2')) return Math.round(value / 0.092903);
  return Math.round(value);
}

function mapType(item: AzzouzanaItem): 'off_plan' | 'ready' {
  const cs = (item.completion_status ?? '').toLowerCase();
  if (cs.includes('off') || cs.includes('off_plan') || cs.includes('off-plan') || cs.includes('off plan')) return 'off_plan';
  return 'ready';
}

function mapCommunity(item: AzzouzanaItem): string {
  // location_tree is [Emirate, Community, Sub-community/Building].
  // E.g. ['Dubai', 'Damac Lagoons', 'Morocco Phase 2'] → community = "Damac Lagoons"
  const tree = (item.location_tree ?? []).map((n) => n?.name).filter(Boolean) as string[];
  if (tree.length >= 2) return tree[1];
  if (tree.length === 1) return tree[0];
  return item.location?.name ?? item.location?.full_name?.split(',')?.[0]?.trim() ?? 'Dubai';
}

function mapSubLocation(item: AzzouzanaItem): string | null {
  const tree = (item.location_tree ?? []).map((n) => n?.name).filter(Boolean) as string[];
  if (tree.length >= 3) return tree[tree.length - 1];
  return item.location?.name ?? null;
}

function mapProject(item: AzzouzanaItem): string {
  // The "project" in broker-template terms is most specific area, not the
  // marketing title (which is broker copy like "BEST DEAL EVER | BELOW OP").
  // The deepest location_tree entry is the building / sub-community / cluster.
  const tree = (item.location_tree ?? []).map((n) => n?.name).filter(Boolean) as string[];
  if (tree.length >= 3) return tree[tree.length - 1];
  if (tree.length >= 2) return tree[tree.length - 1];
  return item.location?.full_name?.split(',')[0]?.trim() ?? 'Unknown';
}

function mapImages(item: AzzouzanaItem): string[] {
  // azzouzana returns images[] at top level with `small` (416×272) and `medium` (668×452).
  // No `full` field. Prefer medium for quality, fall back to small.
  const arr = item.images ?? [];
  return arr.slice(0, 4).map((p) => p.full ?? p.medium ?? p.small).filter(Boolean) as string[];
}

function mapExternalRef(item: AzzouzanaItem): string | null {
  // Use PF's numeric id (matches share_url and is the canonical unique key).
  // `reference` is the broker's own ID and isn't stable across re-listings.
  const ref = item.id != null ? String(item.id) : item.reference;
  if (!ref) return null;
  return ref.startsWith('PF-') ? ref : `PF-${ref}`;
}

/**
 * Curated list of common Dubai developers. Matched case-insensitively against
 * title + description + location_tree names. Order matters: longer names first
 * so we don't match a substring of a longer developer.
 */
const KNOWN_DEVELOPERS = [
  'Majid Al Futtaim','Coldwell Banker','Five Holdings','Dubai Holding','Select Group',
  'Sobha Realty','Sobha','Emaar','EMAAR','DAMAC','Damac','Nakheel','Meraas','Binghatti',
  'Azizi','Aldar','Danube','Samana','Ellington','Omniyat','Deyaar','Tiger','MAG',
  'Dubai Properties','Meydan','Wasl','Range Developments','Object 1','Tilal','Beach Mansion',
];

function deriveDeveloper(item: AzzouzanaItem): string | null {
  // Search across the title + the deepest location_tree entry (the building/
  // project name usually contains the developer brand).
  const tree = (item.location_tree ?? []).map((n) => n?.name).filter(Boolean) as string[];
  const haystack = [item.title, tree.join(' ')].filter(Boolean).join(' ');
  const upper = haystack.toUpperCase();
  for (const k of KNOWN_DEVELOPERS) {
    if (upper.includes(k.toUpperCase())) {
      // Normalize: title-case (except all-caps brands like DAMAC)
      if (k.toUpperCase() === k && k.length <= 5) return k; // DAMAC, MAG → keep upper
      return k.charAt(0).toUpperCase() + k.slice(1);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface ApifyWebhookPayload {
  eventType?: string;
  eventData?: { actorId?: string; actorRunId?: string };
  resource?: { id?: string; defaultDatasetId?: string; status?: string };
}

function authorize(req: Request): boolean {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

async function fetchDataset(datasetId: string, limit = 1000): Promise<AzzouzanaItem[]> {
  const token = process.env.APIFY_TOKEN;
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&limit=${limit}` +
    (token ? `&token=${token}` : '');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Apify dataset fetch ${resp.status}`);
  const raw: unknown[] = await resp.json();

  // Auto-detect scraper variant and normalise. Today we accept either
  // azzouzana (snake_case) or shahidirfan (camelCase). Per-item detection
  // is robust to a future schedule that mixes scrapers.
  let shahidirfanCount = 0;
  const normalised = raw.map((item) => {
    if (isShahidirfan(item)) {
      shahidirfanCount++;
      return normaliseShahidirfan(item);
    }
    return item as AzzouzanaItem;
  });
  if (shahidirfanCount > 0) {
    console.log(`[apify webhook] normalised ${shahidirfanCount}/${raw.length} items from shahidirfan schema`);
  }
  return normalised;
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: 'db not configured' }, { status: 503 });
  }

  let payload: ApifyWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const runId = payload.eventData?.actorRunId ?? payload.resource?.id;
  const datasetId = payload.resource?.defaultDatasetId;
  const actorId = payload.eventData?.actorId;

  if (!datasetId) {
    return NextResponse.json({ ok: false, error: 'no datasetId in payload' }, { status: 400 });
  }
  if (!runId) {
    return NextResponse.json({ ok: false, error: 'no runId in payload' }, { status: 400 });
  }

  // Migration 0003: log the run lifecycle. Idempotent on (run_id) — Apify
  // retries land on the same row.
  let ingestionRunDbId: number | null = null;
  try {
    ingestionRunDbId = await startIngestionRun({ runId, datasetId, actorName: actorId });
  } catch (e) {
    // Don't bail the webhook if logging itself fails — ingestion is the
    // critical path. Just record + continue.
    console.error('[apify webhook] failed to open ingestion_runs row', e);
  }

  let items: AzzouzanaItem[];
  try {
    items = await fetchDataset(datasetId, 2000);
  } catch (e) {
    if (ingestionRunDbId !== null) {
      await failIngestionRun(ingestionRunDbId, `dataset fetch: ${(e as Error).message}`).catch(() => {});
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }

  // Stats counters mirror the ingestion_runs columns exactly.
  const stats = {
    items_received: items.length,
    items_inserted: 0,
    items_updated: 0,
    items_unchanged: 0,
    items_withdrawn: 0,
    items_errored: 0,
    // Forensic detail; persisted in raw_stats JSONB.
    priceDrops: 0,
    opParsed: 0,
  };

  // Collect successfully-processed external_refs so we can run stale-listing
  // pruning after the loop. Only refs that successfully upserted are added —
  // items that errored aren't proof of presence on PF.
  const seenRefs: string[] = [];

  for (const item of items) {
    try {
      const externalRef = mapExternalRef(item);
      const currentPrice = item.price?.value ?? 0;
      if (!externalRef || !currentPrice) {
        stats.items_errored++;
        continue;
      }

      // Concatenate title + description so parsers see broker copy in both
      // ("BELOW OP" tags often live in the title, OP values often in description).
      const desc = [item.title, item.description].filter(Boolean).join('\n\n') || null;
      const opParse = parseOp(desc, currentPrice);
      const originalPrice = opParse.op ?? Math.round(currentPrice * 1.05); // fallback: 5% baseline
      if (opParse.op !== null) stats.opParsed++;

      const beds = mapBeds(item);
      const view = parseView(desc);
      const floorPosition = parseFloor(desc);
      const unitType = composeUnitType({ beds, propertyType: item.property_type, description: desc });
      // Use amenity_names (human-readable) — `amenities` is short codes.
      const features = extractFeatures({
        amenities: item.amenity_names ?? [],
        description: desc,
        view,
        floorPosition,
      });
      const bathroomsRaw = item.bathrooms_value ?? item.bathrooms;
      const bathrooms = bathroomsRaw ? parseInt(String(bathroomsRaw).replace(/[^0-9]/g, ''), 10) || null : null;

      const result = await upsertScrapedListing({
        externalRef,
        project: mapProject(item),
        developer: deriveDeveloper(item),
        community: mapCommunity(item),
        subLocation: mapSubLocation(item),
        type: mapType(item),
        beds,
        sqft: mapSqft(item),
        currentPrice,
        originalPrice,
        sourceImageUrls: mapImages(item),
        listedAt: item.listed_date ?? new Date().toISOString(),
        raw: item,
        unitType,
        bathrooms,
        features,
        view,
        floorPosition,
        handover: parseHandover(desc),
        paymentStatus: parsePaymentStatus(desc),
        // Use structured fields when present, parse from description as fallback.
        plotSizeSqft: item.plot_size ?? parsePlotSize(desc),
        buaSqft: item.built_up_area ?? parseBua(desc),
        furnished: item.furnished ?? null,
      });
      if (result.isNew) {
        stats.items_inserted++;
      } else if (result.priceDropped || result.previousPrice !== currentPrice) {
        stats.items_updated++;
        if (result.priceDropped) stats.priceDrops++;
      } else {
        stats.items_unchanged++;
      }
      seenRefs.push(externalRef);
    } catch (e) {
      console.error('[apify webhook] item failed', e);
      stats.items_errored++;
    }
  }

  // Stale-listing pruning (task #66, 2-miss conservative).
  //
  // Only run pruning when we have a healthy seen-set. A run that returns 0
  // items (proxy block, anti-bot, network error) must NOT trigger mass
  // withdrawal — the watchdog cron handles that case by alerting.
  if (seenRefs.length > 0) {
    try {
      await markListingsSeen(seenRefs);
      const pruning = await incrementMissesAndPrune(seenRefs);
      stats.items_withdrawn = pruning.withdrawn;
      console.log(
        `[apify webhook] pruning: ${pruning.incremented} miss++, ${pruning.withdrawn} withdrawn`,
      );
    } catch (e) {
      console.error('[apify webhook] pruning step failed', e);
      // Don't fail the run for a pruning hiccup — the data ingestion already
      // succeeded. Pruning will catch up on the next run.
    }
  } else {
    console.warn('[apify webhook] no items seen — skipping pruning to avoid mass withdrawal');
  }

  // Close the run row with final stats.
  if (ingestionRunDbId !== null) {
    const finalStatus =
      stats.items_errored === 0
        ? 'succeeded'
        : stats.items_errored < items.length
          ? 'partial'
          : 'failed';
    await completeIngestionRun(
      ingestionRunDbId,
      {
        items_received: stats.items_received,
        items_inserted: stats.items_inserted,
        items_updated: stats.items_updated,
        items_unchanged: stats.items_unchanged,
        items_withdrawn: stats.items_withdrawn,
        items_errored: stats.items_errored,
        rawStats: { priceDrops: stats.priceDrops, opParsed: stats.opParsed, runId, datasetId, actorId },
      },
      finalStatus,
    ).catch((e) => console.error('[apify webhook] failed to close ingestion_runs row', e));
  }

  console.log('[apify webhook]', runId, stats);
  return NextResponse.json({ ok: true, runId, stats });
}
