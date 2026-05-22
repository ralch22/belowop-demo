export function formatAED(n: number): string {
  return new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
}

export function dropPct(current: number, original: number): number {
  return ((current - original) / original) * 100;
}

export function dropColor(deltaPct: number): string {
  if (deltaPct <= -10) return 'text-red-700 dark:text-red-400';
  if (deltaPct <= -5) return 'text-amber-700 dark:text-amber-400';
  return 'text-slate-600 dark:text-slate-400';
}

export function relativeTime(iso: string, nowMs?: number): string {
  const now = nowMs ?? Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.max(1, Math.floor((now - then) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

export function bedsLabel(beds: number | 'studio'): string {
  if (beds === 'studio') return 'Studio';
  return `${beds} BR`;
}

export function imageUrl(id: string, w = 800): string {
  return `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;
}

// Convert sqft → m² (1 sqft = 0.092903 m²)
export function sqftToSqm(sqft: number): number {
  return Math.round(sqft * 0.092903);
}

export function formatSqm(sqft: number): string {
  return `${sqftToSqm(sqft).toLocaleString()} m²`;
}

// Price per m² in AED — returned as a clean integer
export function pricePerSqm(price: number, sqft: number): number {
  return Math.round(price / (sqft * 0.092903));
}

export function formatPricePerSqm(price: number, sqft: number): string {
  return formatAED(pricePerSqm(price, sqft));
}

// Generate a stable opaque ID from the listing ref so we don't surface the
// PropertyFinder reference number on the public URL.
// PF-44021 → u-{base36 of a salted hash}
export function opaqueIdFromRef(ref: string): string {
  let h = 2166136261 >>> 0; // FNV-1a 32-bit seed
  for (let i = 0; i < ref.length; i++) {
    h ^= ref.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 'u-' + h.toString(36).padStart(6, '0').slice(0, 7);
}
