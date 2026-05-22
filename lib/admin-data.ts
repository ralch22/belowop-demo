/**
 * Server-side data fetches for the admin dashboard.
 * All return safe defaults when DB isn't configured so /admin works in demo mode.
 */
import { sql } from './db';
import { isDbConfigured } from './db';
import { listings as seedListings } from './listings';

export interface AdminStats {
  listings: { total: number; offPlan: number; ready: number; withdrawn: number };
  leads: { total: number; last24h: number; notified: number };
  alerts: { pending: number; dispatched: number; errored: number };
  subscriptions: { active: number; pending: number; unsubscribed: number };
  ingest: { lastRunAt: string | null; opParseRate: number | null };
  source: 'db' | 'seed';
}

export async function getStats(): Promise<AdminStats> {
  if (!isDbConfigured()) {
    return {
      listings: {
        total: seedListings.length,
        offPlan: seedListings.filter((l) => l.type === 'off_plan').length,
        ready: seedListings.filter((l) => l.type === 'ready').length,
        withdrawn: 0,
      },
      leads: { total: 0, last24h: 0, notified: 0 },
      alerts: { pending: 0, dispatched: 0, errored: 0 },
      subscriptions: { active: 0, pending: 0, unsubscribed: 0 },
      ingest: { lastRunAt: null, opParseRate: null },
      source: 'seed',
    };
  }

  try {
    const [l, le, al, sb, ing] = await Promise.all([
      sql<{ total: number; off_plan: number; ready: number; withdrawn: number }>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE type = 'off_plan')::int AS off_plan,
          COUNT(*) FILTER (WHERE type = 'ready')::int AS ready,
          COUNT(*) FILTER (WHERE withdrawn_at IS NOT NULL)::int AS withdrawn
        FROM listings;`,
      sql<{ total: number; last_24h: number; notified: number }>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE captured_at > NOW() - INTERVAL '24 hours')::int AS last_24h,
          COUNT(*) FILTER (WHERE notified_at IS NOT NULL)::int AS notified
        FROM leads;`,
      sql<{ pending: number; dispatched: number; errored: number }>`
        SELECT
          COUNT(*) FILTER (WHERE dispatched_at IS NULL AND dispatch_error IS NULL)::int AS pending,
          COUNT(*) FILTER (WHERE dispatched_at IS NOT NULL)::int AS dispatched,
          COUNT(*) FILTER (WHERE dispatch_error IS NOT NULL)::int AS errored
        FROM alert_events;`,
      sql<{ active: number; pending: number; unsubscribed: number }>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed
        FROM subscriptions;`,
      sql<{ last_run: string | null; with_op: number; total: number }>`
        SELECT
          MAX(updated_at)::text AS last_run,
          COUNT(*) FILTER (WHERE original_price > current_price * 1.01)::int AS with_op,
          COUNT(*)::int AS total
        FROM listings;`,
    ]);
    return {
      listings: {
        total: l.rows[0].total,
        offPlan: l.rows[0].off_plan,
        ready: l.rows[0].ready,
        withdrawn: l.rows[0].withdrawn,
      },
      leads: {
        total: le.rows[0].total,
        last24h: le.rows[0].last_24h,
        notified: le.rows[0].notified,
      },
      alerts: {
        pending: al.rows[0].pending,
        dispatched: al.rows[0].dispatched,
        errored: al.rows[0].errored,
      },
      subscriptions: {
        active: sb.rows[0].active,
        pending: sb.rows[0].pending,
        unsubscribed: sb.rows[0].unsubscribed,
      },
      ingest: {
        lastRunAt: ing.rows[0].last_run,
        opParseRate: ing.rows[0].total > 0 ? ing.rows[0].with_op / ing.rows[0].total : null,
      },
      source: 'db',
    };
  } catch (e) {
    console.error('[admin] stats failed', e);
    return {
      listings: { total: 0, offPlan: 0, ready: 0, withdrawn: 0 },
      leads: { total: 0, last24h: 0, notified: 0 },
      alerts: { pending: 0, dispatched: 0, errored: 0 },
      subscriptions: { active: 0, pending: 0, unsubscribed: 0 },
      ingest: { lastRunAt: null, opParseRate: null },
      source: 'db',
    };
  }
}

export interface AdminRecentLead {
  id: number;
  name: string;
  phone: string;
  project: string | null;
  captured_at: string;
  notified: boolean;
}

export async function getRecentLeads(limit = 10): Promise<AdminRecentLead[]> {
  if (!isDbConfigured()) return [];
  try {
    const r = await sql<AdminRecentLead>`
      SELECT l.id, l.name, l.phone, ls.project, l.captured_at::text,
             (l.notified_at IS NOT NULL) AS notified
      FROM leads l
      LEFT JOIN listings ls ON ls.id = l.listing_id
      ORDER BY l.captured_at DESC
      LIMIT ${limit};
    `;
    return r.rows;
  } catch { return []; }
}

export interface AdminRecentListing {
  external_ref: string;
  project: string;
  developer: string | null;
  community: string;
  type: 'off_plan' | 'ready';
  current_price: number;
  original_price: number;
  updated_at: string;
}

export async function getRecentListings(limit = 10): Promise<AdminRecentListing[]> {
  if (!isDbConfigured()) {
    return seedListings.slice(0, limit).map((l) => ({
      external_ref: l.ref,
      project: l.project,
      developer: l.developer,
      community: l.community,
      type: l.type,
      current_price: l.currentPrice,
      original_price: l.originalPrice,
      updated_at: l.listedAt,
    }));
  }
  try {
    const r = await sql<AdminRecentListing>`
      SELECT external_ref, project, developer, community, type,
             current_price, original_price, updated_at::text
      FROM listings
      ORDER BY updated_at DESC
      LIMIT ${limit};
    `;
    return r.rows;
  } catch { return []; }
}
