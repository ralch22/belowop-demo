// RERA broker-registry domain logic.
//
// Pure, driver-free helpers (kept out of lib/db.ts so they're unit-testable
// without the Postgres driver, mirroring why pickImageUrls lives in format.ts).
// Types + licence-status + firm-name derivation are shared by the import
// script, the DB query layer, and the directory UI.

/** A broker as exposed to the PUBLIC directory — note: no `phone`. */
export interface PublicBroker {
  brokerNumber: string;
  nameEn: string;
  nameAr: string | null;
  gender: number | null;
  licenseStart: string | null; // ISO date (YYYY-MM-DD)
  licenseEnd: string | null; // ISO date (YYYY-MM-DD)
  webpage: string | null;
  firmDomain: string | null;
  firmName: string | null;
  realEstateNumber: string | null;
}

export type LicenseStatus = 'active' | 'expired' | 'unknown';

/**
 * Normalise a raw `webpage` value from the registry into a bare hostname.
 *   'www.famproperties.com'        → 'famproperties.com'
 *   'https://Savana.ae/agents/x'   → 'savana.ae'
 *   ''/null/garbage                → null
 */
export function normalizeFirmDomain(webpage: string | null | undefined): string | null {
  if (!webpage) return null;
  let s = webpage.trim().toLowerCase();
  if (!s) return null;
  if (!/^https?:\/\//.test(s)) s = 'http://' + s;
  try {
    const host = new URL(s).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

// Curated display names for the highest-volume brokerages, so the directory
// reads like a real firm list rather than raw domains. Everything else falls
// back to a humanised second-level domain.
const FIRM_NAME_OVERRIDES: Record<string, string> = {
  'savana.ae': 'Savana Real Estate',
  'famproperties.com': 'fäm Properties',
  'harbordubai.com': 'Harbor Real Estate',
  'engelvoelkers.com': 'Engel & Völkers',
  'bhomes.com': 'Betterhomes',
  'allsoppandallsopp.com': 'Allsopp & Allsopp',
  'espace.ae': 'Espace Real Estate',
  'providentestate.com': 'Provident Estate',
  'driyaestate.com': 'Driya Estate',
  'haus-haus.com': 'Haus & Haus',
};

/** Human-readable firm name from a normalised domain. */
export function firmNameFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  if (FIRM_NAME_OVERRIDES[domain]) return FIRM_NAME_OVERRIDES[domain];
  const sld = domain.split('.')[0] ?? domain;
  // Humanise: split on separators and title-case each word.
  return sld
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ') || null;
}

/**
 * Parse a DLD date (`DD-MM-YYYY`, sometimes `DD/MM/YYYY` or already ISO) into an
 * ISO `YYYY-MM-DD` string. Returns null on anything unparseable so the column
 * stays NULL rather than poisoning the row.
 */
export function parseDldDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

/** Active if the licence end date is today or later. */
export function licenseStatus(end: string | Date | null | undefined, now: Date = new Date()): LicenseStatus {
  if (!end) return 'unknown';
  const d = typeof end === 'string' ? new Date(end + 'T00:00:00Z') : end;
  if (Number.isNaN(d.getTime())) return 'unknown';
  // Compare at day granularity (UTC) so "expires today" still reads active.
  const endDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return endDay >= nowDay ? 'active' : 'expired';
}

/** Whole days until licence expiry (negative if already expired); null if unknown. */
export function daysUntilExpiry(end: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!end) return null;
  const d = typeof end === 'string' ? new Date(end + 'T00:00:00Z') : end;
  if (Number.isNaN(d.getTime())) return null;
  const endDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((endDay - nowDay) / 86_400_000);
}

/** True when active but expiring within `withinDays` (default 90). */
export function isExpiringSoon(
  end: string | Date | null | undefined,
  withinDays = 90,
  now: Date = new Date(),
): boolean {
  const days = daysUntilExpiry(end, now);
  return days !== null && days >= 0 && days <= withinDays;
}

/**
 * UI-facing license tone. Like `licenseStatus`, but splits "active" into
 * `active` vs `expiring` (active but within `withinDays` of expiry) so the
 * directory can warn before a licence lapses. Drives badge colour + icon.
 */
export type LicenseTone = 'active' | 'expiring' | 'expired' | 'unknown';

export function licenseTone(
  end: string | Date | null | undefined,
  withinDays = 90,
  now: Date = new Date(),
): LicenseTone {
  const status = licenseStatus(end, now);
  if (status === 'active' && isExpiringSoon(end, withinDays, now)) return 'expiring';
  return status;
}

/** Format an ISO date (YYYY-MM-DD) as e.g. "2 Jan 2026". Locale-stable. */
export function formatLicenseDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
