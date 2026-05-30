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
import { normalizeFirmDomain, firmNameFromDomain, parseDldDate } from '../lib/rera';

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas /
 *  newlines, and "" escapes. Returns an array of string[] rows. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // swallow — handled by the \n branch
    } else {
      field += c;
    }
  }
  // Flush the trailing field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function intOrNull(v: string | undefined): number | null {
  if (v == null) return null;
  const t = v.trim();
  if (t === '') return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set. Point it at the target database first.');
    process.exit(1);
  }
  const path = process.argv[2] || join(process.cwd(), 'data', 'brokers.csv');
  const text = readFileSync(path, 'utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) {
    console.error(`No data rows found in ${path}.`);
    process.exit(1);
  }

  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    participant_id: col('participant_id'),
    real_estate_broker_id: col('real_estate_broker_id'),
    broker_number: col('broker_number'),
    broker_name_ar: col('broker_name_ar'),
    broker_name_en: col('broker_name_en'),
    gender: col('gender'),
    license_start_date: col('license_start_date'),
    license_end_date: col('license_end_date'),
    webpage: col('webpage'),
    phone: col('phone'),
    real_estate_id: col('real_estate_id'),
    real_estate_number: col('real_estate_number'),
  };
  if (idx.broker_number < 0 || idx.broker_name_en < 0) {
    console.error('CSV is missing required columns broker_number / broker_name_en.');
    console.error('Header was:', header.join(', '));
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let errored = 0;
  const total = rows.length - 1;
  console.log(`Importing ${total} broker rows from ${path}…`);

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const at = (i: number) => (i >= 0 ? cells[i] : undefined);

    const brokerNumber = strOrNull(at(idx.broker_number));
    const nameEn = strOrNull(at(idx.broker_name_en));
    if (!brokerNumber || !nameEn) {
      skipped++;
      continue;
    }
    const webpage = strOrNull(at(idx.webpage));
    const firmDomain = normalizeFirmDomain(webpage);
    const firmName = firmNameFromDomain(firmDomain);
    const licenseStart = parseDldDate(at(idx.license_start_date));
    const licenseEnd = parseDldDate(at(idx.license_end_date));

    try {
      await sql`
        INSERT INTO rera_brokers (
          broker_number, participant_id, real_estate_broker_id,
          name_en, name_ar, gender, license_start, license_end,
          webpage, firm_domain, firm_name, phone,
          real_estate_id, real_estate_number, source
        ) VALUES (
          ${brokerNumber}, ${strOrNull(at(idx.participant_id))}, ${strOrNull(at(idx.real_estate_broker_id))},
          ${nameEn}, ${strOrNull(at(idx.broker_name_ar))}, ${intOrNull(at(idx.gender))},
          ${licenseStart}, ${licenseEnd},
          ${webpage}, ${firmDomain}, ${firmName}, ${strOrNull(at(idx.phone))},
          ${strOrNull(at(idx.real_estate_id))}, ${strOrNull(at(idx.real_estate_number))}, 'dld_csv'
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
      if (errored <= 5) console.error(`  row ${r} (broker ${brokerNumber}):`, (e as Error).message);
    }
    if (inserted % 1000 === 0 && inserted > 0) console.log(`  …${inserted}/${total}`);
  }

  console.log(`Done. upserted=${inserted} skipped=${skipped} errored=${errored}`);
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
