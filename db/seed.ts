// Seed Postgres from data/listings.json so the demo has data immediately.
// Usage: POSTGRES_URL=... npx tsx db/seed.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '@vercel/postgres';

interface Seed {
  ref: string;
  project: string;
  unit: string;
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

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set.');
    process.exit(1);
  }
  const path = join(process.cwd(), 'data', 'listings.json');
  const rows: Seed[] = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`Seeding ${rows.length} listings…`);
  for (const r of rows) {
    // Unsplash URL as a stand-in for the source CDN image so the demo has photos
    // without needing to run the image-sync worker.
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
  // Seed an initial price_history row per listing for parity with what the
  // ingest webhook would have written.
  await sql`
    INSERT INTO price_history (listing_id, price, observed_at)
    SELECT id, current_price, listed_at FROM listings
    ON CONFLICT DO NOTHING;
  `;
  console.log('Seed complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
