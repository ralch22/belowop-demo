// Import the Dubai Land Department / RERA broker registry into rera_brokers.
//
// Usage:
//   POSTGRES_URL=... npx tsx db/import-brokers.ts [path/to/Brokers.csv]
//
// Defaults to data/brokers.csv. The raw CSV carries personal data (names,
// office phone numbers) and is .gitignored — it is never committed or bundled.
// Re-runnable: upserts on broker_number, so a refreshed export just updates.
//
// Columns expected (DLD export):
//   participant_id, real_estate_broker_id, broker_number, broker_name_ar,
//   broker_name_en, gender, license_start_date, license_end_date, webpage,
//   phone, fax, real_estate_id, real_estate_number
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '@vercel/postgres';
import { parseBrokersCsv } from '../lib/brokers-csv';

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set. Point it at the target database first.');
    process.exit(1);
  }
  const path = process.argv[2] || join(process.cwd(), 'data', 'brokers.csv');
  const text = readFileSync(path, 'utf8');
  const { rows, total, skipped: parseSkipped, missingColumns } = parseBrokersCsv(text);
  if (missingColumns) {
    console.error('CSV is missing required columns broker_number / broker_name_en.');
    process.exit(1);
  }
  if (total === 0) {
    console.error(`No data rows found in ${path}.`);
    process.exit(1);
  }

  let inserted = 0;
  let errored = 0;
  console.log(`Importing ${total} broker rows from ${path}…`);

  for (const row of rows) {
    try {
      await sql`
        INSERT INTO rera_brokers (
          broker_number, participant_id, real_estate_broker_id,
          name_en, name_ar, gender, license_start, license_end,
          webpage, firm_domain, firm_name, phone,
          real_estate_id, real_estate_number, source
        ) VALUES (
          ${row.brokerNumber}, ${row.participantId}, ${row.realEstateBrokerId},
          ${row.nameEn}, ${row.nameAr}, ${row.gender},
          ${row.licenseStart}, ${row.licenseEnd},
          ${row.webpage}, ${row.firmDomain}, ${row.firmName}, ${row.phone},
          ${row.realEstateId}, ${row.realEstateNumber}, 'dld_csv'
        )
        ON CONFLICT (broker_number) DO UPDATE SET
          participant_id        = EXCLUDED.participant_id,
          real_estate_broker_id = EXCLUDED.real_estate_broker_id,
          name_en               = EXCLUDED.name_en,
          name_ar               = EXCLUDED.name_ar,
          gender                = EXCLUDED.gender,
          license_start         = EXCLUDED.license_start,
          license_end           = EXCLUDED.license_end,
          webpage               = EXCLUDED.webpage,
          firm_domain           = EXCLUDED.firm_domain,
          firm_name             = EXCLUDED.firm_name,
          phone                 = EXCLUDED.phone,
          real_estate_id        = EXCLUDED.real_estate_id,
          real_estate_number    = EXCLUDED.real_estate_number,
          updated_at            = NOW();
      `;
      inserted++;
    } catch (e) {
      errored++;
      if (errored <= 5) console.error(`  broker ${row.brokerNumber}:`, (e as Error).message);
    }
    if (inserted % 1000 === 0 && inserted > 0) console.log(`  …${inserted}/${total}`);
  }

  console.log(`Done. upserted=${inserted} skipped=${parseSkipped} errored=${errored}`);
  const counts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE license_end >= CURRENT_DATE)::int AS active,
      COUNT(*) FILTER (WHERE license_end <  CURRENT_DATE)::int AS expired,
      COUNT(DISTINCT firm_domain)::int AS firms
    FROM rera_brokers WHERE hidden_at IS NULL;
  `;
  console.log('rera_brokers:', counts.rows[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
