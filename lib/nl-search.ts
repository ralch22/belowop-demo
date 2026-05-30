/**
 * Natural-language search → structured `Filters`.
 *
 * This is the pure, dependency-free core behind the AI-powered search bar
 * (Vercel AI Gateway). It deliberately imports NOTHING from the `ai` SDK so it
 * stays trivially unit-testable (tests/nl-search.test.ts) and can run in any
 * context without a network call.
 *
 * The flow:
 *   1. `buildSearchPrompt(q, vocab)` + `SEARCH_OUTPUT_JSON_SCHEMA` are fed to
 *      `generateObject` in app/api/search/route.ts (the only place that touches
 *      the LLM / gateway).
 *   2. Whatever the model returns — OR what the deterministic `heuristicParse`
 *      fallback produces when the gateway isn't configured — is run through
 *      `sanitizeFilters`, which is the security/quality chokepoint: it clamps
 *      numbers, enforces enums, and resolves free-text community/developer names
 *      back to the canonical vocabulary. Nothing the model emits reaches the
 *      filtering pipeline (or a URL) without passing through here.
 *
 * The output is a `Filters` object — the SAME shape the manual FilterBar
 * produces — so it drives the existing `paramsFromFilters` → `applyFilters`
 * client pipeline with zero special-casing.
 */
import type { Filters, ListingType } from './listings';

/** Canonical option vocabulary the model/heuristic must map onto. */
export interface SearchVocab {
  communities: string[];
  developers: string[];
}

/** Hard cap on the free-text query length the API accepts. */
export const MAX_QUERY_LEN = 280;

// Upper bounds for the numeric filters — defensive clamps so a hallucinated
// "minDropPct: 9000" or "maxPrice: 1e30" can never poison the URL / filter.
const MAX_DROP_PCT = 90;
const MAX_PRICE_AED = 1_000_000_000; // AED 1B — far above any real Dubai unit.

const BEDS_VALUES = ['studio', '1', '2', '3', '4+'] as const;
const SORT_VALUES = ['newest', 'price_asc', 'price_desc', 'drop_desc', 'ppsqm_asc'] as const;

/**
 * JSON Schema handed to `generateObject` (wrapped with `jsonSchema()` from the
 * `ai` SDK at the call site, so this module needs no `ai` dependency). Every
 * field is nullable/optional — the model omits or nulls anything the brief
 * doesn't mention. `sanitizeFilters` is the real enforcement; this schema just
 * shapes the model's output.
 */
export const SEARCH_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: {
      type: ['string', 'null'],
      enum: ['all', 'off_plan', 'ready', null],
      description:
        'Listing readiness: "off_plan" (under construction / pre-handover), "ready" (completed). "all" or null if unspecified.',
    },
    beds: {
      type: ['string', 'null'],
      enum: ['any', 'studio', '1', '2', '3', '4+', null],
      description: 'Bedroom count. Use "4+" for four or more. "any" or null if unspecified.',
    },
    community: {
      type: ['string', 'null'],
      description:
        'The area / community. MUST be copied verbatim from the provided community list, or null if none clearly matches.',
    },
    developer: {
      type: ['string', 'null'],
      description:
        'The developer / brokerage. MUST be copied verbatim from the provided developer list, or null if none clearly matches.',
    },
    minDropPct: {
      type: ['number', 'null'],
      description:
        'Minimum discount below the original price the client wants, as a whole percentage 0-90. null if unspecified.',
    },
    maxPrice: {
      type: ['number', 'null'],
      description:
        'Maximum budget in AED as an absolute integer (e.g. 3000000 for "3M", 750000 for "750k"). null if unspecified.',
    },
    sort: {
      type: ['string', 'null'],
      enum: ['newest', 'price_asc', 'price_desc', 'drop_desc', 'ppsqm_asc', null],
      description:
        'Ordering: price_asc (cheapest first), price_desc (most expensive), drop_desc (biggest discount), ppsqm_asc (best value per m²), newest. null if unspecified.',
    },
  },
  required: [],
} as const;

/** The raw, untrusted shape we expect back from the model (pre-sanitisation). */
export interface RawSearchObject {
  type?: string | null;
  beds?: string | null;
  community?: string | null;
  developer?: string | null;
  minDropPct?: number | string | null;
  maxPrice?: number | string | null;
  sort?: string | null;
}

/**
 * Build the instruction prompt. The live community/developer vocab is injected
 * so the model maps "Marina" → the canonical "Dubai Marina" etc. We cap each
 * list to keep token cost bounded; `sanitizeFilters`/`resolveVocab` still does
 * fuzzy resolution server-side, so a value just outside the truncated list can
 * still be recovered.
 */
export function buildSearchPrompt(q: string, vocab: SearchVocab): string {
  const communities = vocab.communities.slice(0, 80).join(', ') || '(none provided)';
  const developers = vocab.developers.slice(0, 60).join(', ') || '(none provided)';
  return [
    "You convert a Dubai real-estate broker's natural-language client brief into structured search filters for a property-listings site.",
    'Extract ONLY what the brief states. Leave a field null/omitted when the brief does not mention it. Never invent constraints.',
    '',
    'Field rules:',
    '- type: "off_plan" for under-construction / pre-handover, "ready" for completed units, "all" otherwise.',
    '- beds: one of studio | 1 | 2 | 3 | 4+  (use "4+" for four or more bedrooms).',
    `- community: copy ONE value VERBATIM from this list, or null if none clearly matches:\n  ${communities}`,
    `- developer: copy ONE value VERBATIM from this list, or null if none clearly matches:\n  ${developers}`,
    '- minDropPct: whole-number percentage (0-90) the price must be below the original/OP price. e.g. "10% below OP" → 10.',
    '- maxPrice: maximum budget in AED as an absolute integer. "3M"/"3 million" → 3000000, "750k" → 750000.',
    '- sort: price_asc (cheapest), price_desc (most expensive), drop_desc (biggest discount), ppsqm_asc (best value per m²), or newest.',
    '',
    `Client brief:\n"""\n${q}\n"""`,
  ].join('\n');
}

// ---------- sanitisation / resolution ----------

function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, _]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Resolve a free-text area/developer name onto the canonical vocabulary.
 * Tolerant by design (the model may return "Marina" for "Dubai Marina"):
 *   1. exact, case-insensitive
 *   2. a canonical entry that CONTAINS the value  (prefer the shortest)
 *   3. a canonical entry CONTAINED IN the value   (prefer the longest)
 * Returns the canonical string, or undefined when nothing plausibly matches.
 */
export function resolveVocab(value: string | null | undefined, vocab: string[]): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (!v || !vocab.length) return undefined;

  const exact = vocab.find((c) => c.toLowerCase() === v);
  if (exact) return exact;

  const contains = vocab
    .filter((c) => c.toLowerCase().includes(v))
    .sort((a, b) => a.length - b.length);
  if (contains.length) return contains[0];

  const containedIn = vocab
    .filter((c) => v.includes(c.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  if (containedIn.length) return containedIn[0];

  return undefined;
}

/**
 * The security/quality chokepoint. Takes whatever the model (or heuristic)
 * produced and returns a `Filters` containing ONLY safe, in-range, canonical
 * values. Default-equivalent values ("all", "any", "newest", 0) are omitted so
 * the caller can layer the result over explicit defaults to clear stale state.
 */
export function sanitizeFilters(raw: RawSearchObject | null | undefined, vocab: SearchVocab): Filters {
  const r = (raw ?? {}) as RawSearchObject;
  const out: Filters = {};

  if (r.type === 'off_plan' || r.type === 'ready') {
    out.type = r.type as ListingType;
  }

  const beds = typeof r.beds === 'string' ? r.beds.trim() : '';
  if ((BEDS_VALUES as readonly string[]).includes(beds)) {
    out.beds = beds as Filters['beds'];
  }

  const community = resolveVocab(r.community, vocab.communities);
  if (community) out.community = community;

  const developer = resolveVocab(r.developer, vocab.developers);
  if (developer) out.developer = developer;

  const drop = toNum(r.minDropPct);
  if (drop !== undefined && drop > 0) {
    out.minDropPct = Math.min(MAX_DROP_PCT, Math.round(drop));
  }

  const max = toNum(r.maxPrice);
  if (max !== undefined && max > 0) {
    out.maxPrice = Math.min(MAX_PRICE_AED, Math.round(max));
  }

  if (typeof r.sort === 'string' && (SORT_VALUES as readonly string[]).includes(r.sort)) {
    if (r.sort !== 'newest') out.sort = r.sort as Filters['sort'];
  }

  return out;
}

// ---------- deterministic fallback ----------

/** Convert a captured number + optional magnitude suffix to an AED integer. */
function moneyToNumber(numStr: string, unit?: string): number | undefined {
  const n = parseFloat(numStr.replace(/,/g, ''));
  if (!Number.isFinite(n)) return undefined;
  const u = (unit ?? '').toLowerCase();
  if (u.startsWith('m')) return Math.round(n * 1_000_000);
  if (u.startsWith('k') || u.startsWith('thous')) return Math.round(n * 1_000);
  // Bare number with no suffix: a small figure almost certainly means millions
  // in Dubai property pricing ("under 3" → AED 3M); large figures are literal.
  if (n < 1000) return Math.round(n * 1_000_000);
  return Math.round(n);
}

/** Longest canonical vocab entry that appears as a substring of the query. */
function bestVocabMatch(haystack: string, vocab: string[]): string | undefined {
  let best: string | undefined;
  for (const entry of vocab) {
    const e = entry.toLowerCase();
    if (e && haystack.includes(e) && (!best || entry.length > best.length)) best = entry;
  }
  return best;
}

/**
 * Deterministic, no-LLM parse used when the AI Gateway isn't configured (local
 * dev / pre-provisioning) or as a fallback if the gateway call fails. It is
 * intentionally conservative — it only sets a filter when a clear keyword
 * signals it. The result is run through `sanitizeFilters` so clamping and vocab
 * canonicalisation are identical to the AI path.
 */
export function heuristicParse(q: string, vocab: SearchVocab): Filters {
  const s = q.toLowerCase();
  const raw: RawSearchObject = {};

  // type
  if (/off[\s-]?plan|pre[\s-]?handover|under construction/.test(s)) raw.type = 'off_plan';
  else if (/\bready\b|completed|move[\s-]?in/.test(s)) raw.type = 'ready';

  // beds
  if (/\bstudio\b/.test(s)) {
    raw.beds = 'studio';
  } else {
    const m = s.match(/(\d+)\s*\+?[\s-]*(?:bedrooms|bedroom|beds|bed|br|b\/r)\b/);
    if (m) {
      const n = parseInt(m[1], 10);
      raw.beds = n >= 4 ? '4+' : String(n);
    } else if (/\b4\s*\+/.test(s)) {
      raw.beds = '4+';
    }
  }

  // maxPrice — only when a budget keyword precedes the figure.
  const price = s.match(
    /(?:under|below|max(?:imum)?|up to|less than|cheaper than|budget(?:\s+of)?|<=?)\s*(?:aed\s*)?([\d.,]+)\s*(m|mn|million|k|thousand)?/,
  );
  if (price) {
    const val = moneyToNumber(price[1], price[2]);
    if (val) raw.maxPrice = val;
  }

  // minDropPct — first 1-2 digit percentage in the brief.
  const drop = s.match(/(\d{1,2})\s*%/);
  if (drop) raw.minDropPct = parseInt(drop[1], 10);

  // sort
  if (/(?:biggest|largest|best|deepest|most)\s+(?:drop|discount)|biggest drop/.test(s)) {
    raw.sort = 'drop_desc';
  } else if (/cheapest|lowest price|low(?:est)?[\s-]?to[\s-]?high|price.*(?:low|asc)/.test(s)) {
    raw.sort = 'price_asc';
  } else if (/most expensive|highest price|high(?:est)?[\s-]?to[\s-]?low|premium/.test(s)) {
    raw.sort = 'price_desc';
  } else if (/best value|per\s?(?:sqm|sqft|m2|m²)|value for money/.test(s)) {
    raw.sort = 'ppsqm_asc';
  } else if (/newest|latest|recent|just listed/.test(s)) {
    raw.sort = 'newest';
  }

  // community / developer — canonical substring match against live vocab.
  raw.community = bestVocabMatch(s, vocab.communities) ?? null;
  raw.developer = bestVocabMatch(s, vocab.developers) ?? null;

  return sanitizeFilters(raw, vocab);
}
