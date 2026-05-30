/**
 * Dub (dub.co) link-shortening + click-analytics client.
 *
 * Mints ONE trackable short link per listing for outbound alerts (Telegram /
 * WhatsApp) and reads click counts back for the admin dashboard.
 *
 * Required env:
 *   DUB_API_KEY — workspace API key (dub_xxxx). When ABSENT this client is a
 *                 no-op stub: shortenListing() returns null so callers fall back
 *                 to the long /?inquire= deep link (an alert never breaks because
 *                 Dub is down or unconfigured), and analytics returns ok:false.
 * Optional env:
 *   DUB_DOMAIN  — branded short domain on the workspace (defaults to dub.sh).
 *
 * PRIVACY (matches lib/listings.ts): the ONLY listing identifier handed to Dub
 * is the opaque id (`u-xxxxxx`). Both the destination URL (`/?inquire=u-xxxxxx`)
 * and the Dub `externalId` use the opaque id — the raw PropertyFinder ref never
 * leaves the server, so a short link can never be reversed to the source listing.
 *
 * Kept driver-free and side-effect-light (pure body/URL builders split out) so
 * the request shaping is unit-testable without network, mirroring lib/rera.ts.
 */

const API_BASE = 'https://api.dub.co';

export function isDubConfigured(): boolean {
  return Boolean(process.env.DUB_API_KEY);
}

/** Branded short domain when the workspace has one; else Dub's default (dub.sh). */
function dubDomain(): string | undefined {
  const d = process.env.DUB_DOMAIN?.trim();
  return d && d.length > 0 ? d : undefined;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.DUB_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Destination a listing short link resolves to: the public deep link that opens
 * the enquiry modal for that unit. PRIVACY: only the opaque id appears here.
 */
export function listingDestination(webBase: string, opaqueId: string): string {
  const base = webBase.replace(/\/+$/, '');
  return `${base}/?inquire=${encodeURIComponent(opaqueId)}`;
}

/** Dub prefixes caller `externalId`s with `ext_` in analytics / lookup queries. */
export function externalIdQuery(opaqueId: string): string {
  return `ext_${opaqueId}`;
}

export interface UpsertBody {
  url: string;
  externalId: string;
  title?: string;
  domain?: string;
}

/**
 * Pure: the `PUT /links/upsert` body for a listing. Upsert matches on `url`, so
 * one call per listing destination is idempotent — no duplicate links across
 * repeated alerts. Unit-testable, no network.
 */
export function buildUpsertBody(opts: { webBase: string; opaqueId: string; title?: string }): UpsertBody {
  const body: UpsertBody = {
    url: listingDestination(opts.webBase, opts.opaqueId),
    externalId: opts.opaqueId,
  };
  if (opts.title) body.title = opts.title;
  const domain = dubDomain();
  if (domain) body.domain = domain;
  return body;
}

/** Pure: the `GET /analytics` URL for one listing's click count. */
export function analyticsUrl(opaqueId: string, interval = 'all'): string {
  const p = new URLSearchParams({
    event: 'clicks',
    groupBy: 'count',
    interval,
    externalId: externalIdQuery(opaqueId),
  });
  return `${API_BASE}/analytics?${p.toString()}`;
}

export interface DubLink {
  id: string;
  domain: string;
  key: string;
  shortLink: string;
  url: string;
  externalId: string | null;
  clicks?: number;
}

export interface ShortenResult {
  ok: boolean;
  shortLink?: string;
  id?: string;
  clicks?: number;
  error?: string;
  status?: number;
}

/**
 * Create-or-reuse the short link for a listing (idempotent on destination URL).
 * NEVER throws — on missing config or any HTTP/network error it returns
 * ok:false so the caller can fall back to the long deep link and the alert send
 * is never blocked.
 */
export async function upsertListingLink(opts: {
  webBase: string;
  opaqueId: string;
  title?: string;
}): Promise<ShortenResult> {
  if (!isDubConfigured()) return { ok: false, error: 'dub not configured' };
  try {
    const resp = await fetch(`${API_BASE}/links/upsert`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(buildUpsertBody(opts)),
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: (await resp.text()).slice(0, 200) };
    }
    const link = (await resp.json()) as DubLink;
    return { ok: true, shortLink: link.shortLink, id: link.id, clicks: link.clicks };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Dispatch-path convenience: the listing's short link, or null when Dub is
 * unconfigured / errors. Callers fall back to the long deep link.
 */
export async function shortenListing(opts: {
  webBase: string;
  opaqueId: string;
  title?: string;
}): Promise<string | null> {
  const r = await upsertListingLink(opts);
  return r.ok && r.shortLink ? r.shortLink : null;
}

export interface ClicksResult {
  ok: boolean;
  clicks?: number;
  error?: string;
  status?: number;
}

/**
 * Lifetime click count for a listing's short link. Dub's analytics API requires
 * a Pro plan or higher; on a free plan this returns ok:false with the API error.
 */
export async function getListingClicks(opaqueId: string, interval = 'all'): Promise<ClicksResult> {
  if (!isDubConfigured()) return { ok: false, error: 'dub not configured' };
  try {
    const resp = await fetch(analyticsUrl(opaqueId, interval), { headers: authHeaders() });
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: (await resp.text()).slice(0, 200) };
    }
    const data = (await resp.json()) as { clicks?: number };
    return { ok: true, clicks: typeof data.clicks === 'number' ? data.clicks : 0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
