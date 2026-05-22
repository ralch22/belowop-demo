/**
 * Parse structured broker fields out of a PropertyFinder listing description.
 *
 * PropertyFinder doesn't expose most of what brokers care about (OP price,
 * handover quarter, view, floor, payment status, BUA, plot size) as
 * structured fields. They're free text. This module looks for the common
 * patterns brokers use and extracts them.
 *
 * Each parser returns `null` when nothing reliable is found — better than
 * a wrong value.
 */

export { parseOp, type ParsedOp } from './op-parser';

// ---------- Handover (off-plan completion) ----------

/**
 * "Q3 2028" / "Handover: Q3 2028" / "Completion Q1 2027" / "Ready 2028" / "Anticipated Handover Q4 2027"
 * Returns a canonical "Q? YYYY" or "YYYY" string.
 */
export function parseHandover(desc: string | null | undefined): string | null {
  if (!desc) return null;
  // Q? YYYY
  const qMatch = /\b(?:handover|completion|ready|anticipated[\w\s]*)?[\s:\-–]*\b(Q[1-4])[\s\-–]?(\d{4})\b/i.exec(desc);
  if (qMatch) return `${qMatch[1].toUpperCase()} ${qMatch[2]}`;
  // "Handover 2028" / "Completion 2027"
  const yMatch = /\b(?:handover|completion|ready by)\s*[:\-–]?\s*(\d{4})\b/i.exec(desc);
  if (yMatch) {
    const y = parseInt(yMatch[1], 10);
    const now = new Date().getFullYear();
    if (y >= now - 1 && y <= now + 10) return String(y);
  }
  return null;
}

// ---------- View ----------

const VIEW_TYPES = [
  'Marina View',
  'Lagoon View',
  'Burj View',
  'Burj Khalifa View',
  'Sea View',
  'Sea Views',
  'Golf View',
  'Golf Course View',
  'Creek View',
  'Park View',
  'Pool View',
  'Garden View',
  'Skyline View',
  'Downtown View',
  'Canal View',
  'Waterfront',
  'Beachfront',
];

export function parseView(desc: string | null | undefined): string | null {
  if (!desc) return null;
  for (const v of VIEW_TYPES) {
    const re = new RegExp(`\\b${v.replace(/\s/g, '\\s+')}\\b`, 'i');
    if (re.test(desc)) {
      // Normalise plural to singular ("Sea Views" → "Sea View")
      return v.replace(/Views$/i, 'View');
    }
  }
  return null;
}

// ---------- Floor / position ----------

export function parseFloor(desc: string | null | undefined): string | null {
  if (!desc) return null;
  // Tested patterns in priority order.
  const tests: { re: RegExp; out: (m: RegExpExecArray) => string }[] = [
    { re: /\bcorner\s+unit\b/i, out: () => 'Corner Unit' },
    { re: /\bsingle\s+row\b/i, out: () => 'Single Row' },
    { re: /\bend\s+unit\b/i, out: () => 'End Unit' },
    { re: /\bhigh(?:er)?\s+floor\b/i, out: () => 'High Floor' },
    { re: /\bmid\s+floor\b/i, out: () => 'Mid Floor' },
    { re: /\blow\s+floor\b/i, out: () => 'Low Floor' },
    { re: /\bpenthouse\b/i, out: () => 'Penthouse Floor' },
    { re: /\babove\s+(\d{1,2})(?:st|nd|rd|th)?\s+floor\b/i, out: (m) => `Above ${m[1]}th Floor` },
    { re: /\b(\d{1,2})(?:st|nd|rd|th)\s+floor\b/i, out: (m) => `${m[1]}th Floor` },
    { re: /\bfloor\s+(\d{1,2})\b/i, out: (m) => `Floor ${m[1]}` },
    { re: /\bG\+(\d)\b/i, out: (m) => `G+${m[1]}` },
  ];
  for (const t of tests) {
    const m = t.re.exec(desc);
    if (m) return t.out(m);
  }
  return null;
}

// ---------- Payment status ----------

export function parsePaymentStatus(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const tests: { re: RegExp; out: string | ((m: RegExpExecArray) => string) }[] = [
    { re: /\bfully\s+paid\b/i, out: 'Fully Paid' },
    { re: /\bre-?entry\s+opportunity\b/i, out: 'Re-entry Opportunity' },
    // X Year(s) Post Handover / X-Year Post-Handover / X years post handover
    { re: /\b(\d{1,2})[-\s]?years?[-\s]+post[-\s]?handover\b/i, out: (m) => `${m[1]}-Year Post-Handover` },
    { re: /\bpost[-\s]?handover\s+payment\s+plan\b/i, out: 'Post-Handover Payment Plan' },
    { re: /\bpost[-\s]?handover\b/i, out: 'Post-Handover Payment Plan' },
    // PHPP shorthand brokers use (Post-Handover Payment Plan)
    { re: /\bphpp\b/i, out: 'Post-Handover Payment Plan' },
    { re: /\b(\d{1,3})\s*%\s*paid\b/i, out: (m) => `${m[1]}% Paid` },
    { re: /\b(\d{1,2}\/\d{1,2}\/\d{1,2})\s+payment\s+plan\b/i, out: (m) => `${m[1]} Payment Plan` },
  ];
  for (const t of tests) {
    const m = t.re.exec(desc);
    if (m) return typeof t.out === 'string' ? t.out : t.out(m);
  }
  return null;
}

// ---------- BUA / plot size (villa stuff) ----------

function parseSqftWithUnit(value: string, unit: string | undefined): number | null {
  const n = parseFloat(value.replace(/[\s,]/g, ''));
  if (!isFinite(n) || n <= 0) return null;
  const u = (unit || 'sqft').toLowerCase();
  if (u.includes('sqm') || u === 'm' || u.includes('m2') || u.includes('m²')) return Math.round(n / 0.092903);
  return Math.round(n);
}

export function parseBua(desc: string | null | undefined): number | null {
  if (!desc) return null;
  const m = /\bBUA\s*[:\-–]?\s*([\d,\.\s]+)\s*(sqft|sqm|sq\.?\s*m|sq\.?\s*ft|m²|m2|sf)?/i.exec(desc);
  if (m) return parseSqftWithUnit(m[1], m[2]);
  const built = /\bbuilt[-\s]?up\s+area\s*[:\-–]?\s*([\d,\.\s]+)\s*(sqft|sqm|sq\.?\s*m|sq\.?\s*ft|m²|m2|sf)?/i.exec(desc);
  if (built) return parseSqftWithUnit(built[1], built[2]);
  return null;
}

export function parsePlotSize(desc: string | null | undefined): number | null {
  if (!desc) return null;
  const m = /\bplot(?:\s+size)?\s*[:\-–]?\s*([\d,\.\s]+)\s*(sqft|sqm|sq\.?\s*m|sq\.?\s*ft|m²|m2|sf)?/i.exec(desc);
  if (m) return parseSqftWithUnit(m[1], m[2]);
  return null;
}

// ---------- Unit type (compose from beds + property_type + maid flag) ----------

export function composeUnitType(input: {
  beds: string;             // "studio" | "1" | "2" | ...
  propertyType?: string;    // azzouzana: Apartment / Villa / Townhouse / Penthouse
  description?: string | null;
}): string {
  const beds = input.beds === 'studio' ? 'Studio' : input.beds === '4+' ? '4+ Bedroom' : `${input.beds} Bedroom`;
  const propType = (input.propertyType ?? '').trim();
  const desc = input.description ?? '';

  // "+" is not a word char, so a leading \b before \+ never matches; use
  // alternative-specific boundaries instead.
  const hasMaid = /\+\s*maid|\bmaid'?s?\s+room\b|\bwith\s+maid\b|\bmaid'?s?\s+quarters?\b/i.test(desc);
  const isStandalone = /\bstand[-\s]?alone\s+villa\b/i.test(desc);

  if (input.beds === 'studio') {
    return propType ? `Studio ${propType}` : 'Studio';
  }

  let base = beds;
  if (propType) {
    base = `${beds} ${propType}`;
  }
  if (isStandalone && propType?.toLowerCase() === 'villa') {
    base = `${beds} Standalone Villa`;
  }
  if (hasMaid) base += ' + Maid';
  return base;
}

// ---------- Feature extraction ----------

/**
 * Combine azzouzana's amenities[] with a curated keyword scan of the
 * description. Returns deduped, ordered by "broker importance".
 */
const HIGH_VALUE_FEATURES = [
  'Private Pool',
  'Private Garden',
  'Pool & Garden',
  'Maid\'s Room',
  'Driver\'s Room',
  'Study Room',
  'Storage Room',
  'Walk-in Closet',
  'Balcony',
  'Terrace',
  'Open Kitchen',
  'Closed Kitchen',
  'Fully Fitted Kitchen',
  'Smart Home',
  'Branded',
  'Cavalli Branded',
  'Vida Branded',
  'Bulgari Branded',
  'Armani Branded',
  'Furnished',
  'Unfurnished',
  'Semi-Furnished',
  'Vacant',
  'Vacant on Transfer',
  'Tenanted',
  'New to Market',
  'Off-Market',
];

export function extractFeatures(input: {
  amenities?: string[] | null;
  description?: string | null;
  view?: string | null;
  floorPosition?: string | null;
}): string[] {
  const out = new Set<string>();
  if (input.view) out.add(input.view);
  if (input.floorPosition) out.add(input.floorPosition);

  for (const a of input.amenities ?? []) {
    if (a && typeof a === 'string' && a.length < 40) out.add(a);
  }
  for (const f of HIGH_VALUE_FEATURES) {
    const re = new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s+')}\\b`, 'i');
    if (input.description && re.test(input.description)) out.add(f);
  }
  return Array.from(out).slice(0, 8);
}

// ---------- AED → USD (pegged dirham, ≈ 3.6725) ----------

const AED_PER_USD = 3.6725;

/** Format an AED integer as "3.2M" / "850K" — broker shorthand. */
export function formatAedShort(aed: number): string {
  if (aed >= 1_000_000) return `${(aed / 1_000_000).toFixed(aed >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (aed >= 1_000) return `${Math.round(aed / 1_000)}K`;
  return String(aed);
}

export function formatUsdShort(aed: number): string {
  const usd = aed / AED_PER_USD;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(usd >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}
