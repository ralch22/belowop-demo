/**
 * Parse the Original Price (OP) out of a PropertyFinder listing description.
 *
 * PropertyFinder doesn't expose OP as a structured field — brokers write it
 * as free text. This module looks for the common ways they phrase it,
 * extracts the value, and normalises to a plain integer AED amount.
 *
 * Returns { op, dropPct, source } where:
 *   - op: absolute OP value in AED, or null
 *   - dropPct: % below OP if explicitly stated (e.g. "12% below OP"), or null
 *   - source: which pattern matched (for diagnostics)
 *
 * Strategy: try every pattern, collect candidates, return the largest sane
 * absolute value (OP is by definition > current price). If only a percentage
 * is given, the caller can compute op from current price.
 */

export interface ParsedOp {
  op: number | null;
  dropPct: number | null;
  source: string | null;
}

const CURRENCY = /(?:AED|Dhs?|د\.إ|Dh|Dirhams?)/i;

// All patterns expect a numeric token after the cue. We pull the number then normalise.
// The numeric token may include commas, dots, spaces, and an optional M/K suffix.
const NUMBER = /([\d][\d,\.\s]*)\s*(M|m|K|k|Mn|Million|million)?/.source;

const ABSOLUTE_PATTERNS: { regex: RegExp; name: string }[] = [
  // "OP: AED 2,300,000" / "OP 2.3M" / "OP - AED 2.3M"
  { regex: new RegExp(`\\bOP\\s*(?:was|is|of|:)?\\s*[-–]?\\s*${CURRENCY.source}?\\s*${NUMBER}`, 'gi'), name: 'op' },
  // "Original Price: AED 2,300,000"
  { regex: new RegExp(`original\\s+price\\s*[:\\-–]?\\s*${CURRENCY.source}?\\s*${NUMBER}`, 'gi'), name: 'original_price' },
  // "Original AED 2.3M"
  { regex: new RegExp(`\\boriginal\\s+${CURRENCY.source}\\s*${NUMBER}`, 'gi'), name: 'original' },
  // "Was AED 2,300,000"
  { regex: new RegExp(`\\bwas\\s+${CURRENCY.source}?\\s*${NUMBER}`, 'gi'), name: 'was' },
  // "Down from AED 2.3M" / "Reduced from AED 2.3M"
  { regex: new RegExp(`(?:down|reduced)\\s+from\\s+${CURRENCY.source}?\\s*${NUMBER}`, 'gi'), name: 'reduced_from' },
  // "Launch price AED 2.3M"
  { regex: new RegExp(`launch\\s+price\\s*[:\\-–]?\\s*${CURRENCY.source}?\\s*${NUMBER}`, 'gi'), name: 'launch_price' },
];

const PERCENT_PATTERNS: { regex: RegExp; name: string }[] = [
  // "12% below OP" / "12 percent below OP"
  { regex: /(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|percent)\s+below\s+OP\b/gi, name: 'pct_below_op' },
  // "Below OP by 12%" / "Below OP -12%"
  { regex: /below\s+OP\s+(?:by|[-–])\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/gi, name: 'below_op_by' },
];

/** Parse a numeric token from inside a matched pattern. */
function parseAmount(raw: string, suffix?: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, '').replace(/\.$/, '');
  // Heuristic: if it has more than one dot, the dots are thousand-separators.
  const dots = (cleaned.match(/\./g) || []).length;
  let n: number;
  if (dots > 1) n = parseInt(cleaned.replace(/\./g, ''), 10);
  else n = parseFloat(cleaned);
  if (!isFinite(n) || n <= 0) return null;
  const s = (suffix || '').toLowerCase();
  if (s === 'k') n *= 1_000;
  else if (s === 'm' || s === 'mn' || s === 'million') n *= 1_000_000;
  // Sanity check — Dubai property OPs are between AED 200K and AED 200M.
  if (n < 200_000 || n > 200_000_000) return null;
  return Math.round(n);
}

export function parseOp(description: string | null | undefined, currentPrice?: number): ParsedOp {
  if (!description) return { op: null, dropPct: null, source: null };

  // 1. Try absolute-value patterns. Collect candidates.
  const candidates: { value: number; source: string }[] = [];
  for (const { regex, name } of ABSOLUTE_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(description)) !== null) {
      const amount = parseAmount(m[1] ?? '', m[2]);
      if (amount !== null) candidates.push({ value: amount, source: name });
    }
  }

  if (candidates.length > 0) {
    // Filter to values that are plausibly the OP (> current price, if known).
    const plausible = currentPrice ? candidates.filter((c) => c.value > currentPrice) : candidates;
    const pick = (plausible.length > 0 ? plausible : candidates).reduce((a, b) => (b.value > a.value ? b : a));
    return { op: pick.value, dropPct: null, source: pick.source };
  }

  // 2. Try percentage patterns. Compute OP if currentPrice known.
  for (const { regex, name } of PERCENT_PATTERNS) {
    regex.lastIndex = 0;
    const m = regex.exec(description);
    if (m) {
      const pct = parseFloat(m[1]);
      if (isFinite(pct) && pct > 0 && pct < 60) {
        const op = currentPrice ? Math.round(currentPrice / (1 - pct / 100)) : null;
        return { op, dropPct: pct, source: name };
      }
    }
  }

  return { op: null, dropPct: null, source: null };
}
