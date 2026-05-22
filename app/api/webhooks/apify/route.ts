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
import { upsertScrapedListing, isDbConfigured } from '@/lib/db';
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
// azzouzana output schema (subset we care about)
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
  return resp.json();
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

  if (!datasetId) {
    return NextResponse.json({ ok: false, error: 'no datasetId in payload' }, { status: 400 });
  }

  let items: AzzouzanaItem[];
  try {
    items = await fetchDataset(datasetId, 2000);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }

  const stats = { received: items.length, upserted: 0, newListings: 0, priceDrops: 0, opParsed: 0, errors: 0 };

  for (const item of items) {
    try {
      const externalRef = mapExternalRef(item);
      const currentPrice = item.price?.value ?? 0;
      if (!externalRef || !currentPrice) {
        stats.errors++;
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
      stats.upserted++;
      if (result.isNew) stats.newListings++;
      if (result.priceDropped) stats.priceDrops++;
    } catch (e) {
      console.error('[apify webhook] item failed', e);
      stats.errors++;
    }
  }

  console.log('[apify webhook]', runId, stats);
  return NextResponse.json({ ok: true, runId, stats });
}
