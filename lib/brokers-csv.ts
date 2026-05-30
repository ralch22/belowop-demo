// Shared, driver-free parsing of the DLD / RERA broker-registry CSV export.
//
// Used by BOTH:
//   * db/import-brokers.ts  — CLI, direct DB (when POSTGRES_URL is available)
//   * app/api/admin/db (action=brokers-import) — server-side, CSV uploaded in
//     the request body. That endpoint is the ONLY way to load the registry into
//     prod, because the Marketplace-managed Postgres credentials are "sensitive"
//     and cannot be pulled to localhost.
//
// Kept pure (no pg driver) so it is unit-testable and reused identically by both
// paths — mirroring why lib/rera.ts holds the driver-free domain helpers.

import { normalizeFirmDomain, firmNameFromDomain, parseDldDate } from './rera';

/** One registry row, normalised and ready to upsert into rera_brokers. */
export interface BrokerImportRow {
  brokerNumber: string;
  participantId: string | null;
  realEstateBrokerId: string | null;
  nameEn: string;
  nameAr: string | null;
  gender: number | null;
  licenseStart: string | null; // ISO YYYY-MM-DD
  licenseEnd: string | null; // ISO YYYY-MM-DD
  webpage: string | null;
  firmDomain: string | null;
  firmName: string | null;
  phone: string | null; // INTERNAL ONLY — never selected on public pages
  realEstateId: string | null;
  realEstateNumber: string | null;
}

/** INSERT column order shared by the CLI and the server import. `source` is
 *  pinned to 'dld_csv' by brokerRowToValues, so it trails the row fields. */
export const BROKER_COLUMNS = [
  'broker_number',
  'participant_id',
  'real_estate_broker_id',
  'name_en',
  'name_ar',
  'gender',
  'license_start',
  'license_end',
  'webpage',
  'firm_domain',
  'firm_name',
  'phone',
  'real_estate_id',
  'real_estate_number',
  'source',
] as const;

/** Positional values for one row, matching BROKER_COLUMNS exactly. */
export function brokerRowToValues(r: BrokerImportRow): unknown[] {
  return [
    r.brokerNumber,
    r.participantId,
    r.realEstateBrokerId,
    r.nameEn,
    r.nameAr,
    r.gender,
    r.licenseStart,
    r.licenseEnd,
    r.webpage,
    r.firmDomain,
    r.firmName,
    r.phone,
    r.realEstateId,
    r.realEstateNumber,
    'dld_csv',
  ];
}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas /
 *  newlines, and "" escapes. Returns an array of string[] rows. */
export function parseCsv(text: string): string[][] {
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

export interface ParsedBrokers {
  rows: BrokerImportRow[];
  total: number; // data rows seen (excludes header)
  skipped: number; // rows dropped for missing broker_number / name_en
  missingColumns: boolean; // header lacked the required columns
}

/** Parse the DLD export into normalised, upsert-ready rows.
 *
 * Expected DLD columns:
 *   participant_id, real_estate_broker_id, broker_number, broker_name_ar,
 *   broker_name_en, gender, license_start_date, license_end_date, webpage,
 *   phone, fax, real_estate_id, real_estate_number
 */
export function parseBrokersCsv(text: string): ParsedBrokers {
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], total: 0, skipped: 0, missingColumns: false };

  const header = all[0].map((h) => h.trim());
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

  const total = all.length - 1;
  if (idx.broker_number < 0 || idx.broker_name_en < 0) {
    return { rows: [], total, skipped: 0, missingColumns: true };
  }

  const rows: BrokerImportRow[] = [];
  let skipped = 0;
  for (let r = 1; r < all.length; r++) {
    const cells = all[r];
    const at = (i: number) => (i >= 0 ? cells[i] : undefined);

    const brokerNumber = strOrNull(at(idx.broker_number));
    const nameEn = strOrNull(at(idx.broker_name_en));
    if (!brokerNumber || !nameEn) {
      skipped++;
      continue;
    }
    const webpage = strOrNull(at(idx.webpage));
    const firmDomain = normalizeFirmDomain(webpage);
    rows.push({
      brokerNumber,
      participantId: strOrNull(at(idx.participant_id)),
      realEstateBrokerId: strOrNull(at(idx.real_estate_broker_id)),
      nameEn,
      nameAr: strOrNull(at(idx.broker_name_ar)),
      gender: intOrNull(at(idx.gender)),
      licenseStart: parseDldDate(at(idx.license_start_date)),
      licenseEnd: parseDldDate(at(idx.license_end_date)),
      webpage,
      firmDomain,
      firmName: firmNameFromDomain(firmDomain),
      phone: strOrNull(at(idx.phone)),
      realEstateId: strOrNull(at(idx.real_estate_id)),
      realEstateNumber: strOrNull(at(idx.real_estate_number)),
    });
  }
  return { rows, total, skipped, missingColumns: false };
}
