/**
 * Pipeline watchdog — daily cron that detects silent failure modes.
 *
 * Runs from vercel.json crons. Three checks (any → fires a Telegram DM
 * to the broker via @DubaiPropertyDealsbot):
 *
 *   1. STALE_PIPELINE   — no ingestion_runs row in >26h
 *      Means the Apify schedule stopped firing OR the webhook can't reach us.
 *
 *   2. STALE_DATA       — no NEW listings in >48h
 *      Means runs are firing but actor returns empty (anti-bot block, URL
 *      change, etc. — exactly the failure mode we hit with azzouzana).
 *
 *   3. LAST_RUN_ERRORED — most recent ingestion_runs has status='failed'
 *      Means the webhook handler crashed; needs investigation.
 *
 * The dashboard at /admin/pipeline uses the same thresholds — it goes
 * red BEFORE the cron pings (dashboard = leading indicator, alert = backstop).
 *
 * Auth: same as other crons — checks Vercel's x-vercel-cron header in prod.
 * For manual testing: pass `?token=$ADMIN_TOKEN` as a fallback.
 */
import { NextResponse } from 'next/server';
import { sql, ingestionFreshness, isDbConfigured } from '@/lib/db';
import { sendTelegram, isTelegramConfigured, escapeMd } from '@/lib/telegram';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

// Thresholds — mirror /admin/pipeline so dashboard + cron stay in lockstep.
const STALE_RUN_HOURS = 26;       // > 26h since last run → critical
const STALE_DATA_HOURS = 48;      // > 48h since last new listing → warn
const NOTIFY_DEBOUNCE_HOURS = 12; // don't re-alarm within this window

interface Alarm {
  code: 'STALE_PIPELINE' | 'STALE_DATA' | 'LAST_RUN_ERRORED';
  message: string;
  detail?: string;
}

function authorizeCron(req: Request): boolean {
  // Vercel cron sets this header automatically.
  if (req.headers.get('x-vercel-cron') === '1') return true;

  // Manual / curl-based testing: ?token=ADMIN_TOKEN or Authorization: Bearer
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token');
  const headerToken = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const provided = queryToken || headerToken;
  if (!provided) return false;

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function checkAlarms(): Promise<Alarm[]> {
  const alarms: Alarm[] = [];
  const f = await ingestionFreshness();
  const now = Date.now();

  // (1) Pipeline silent for too long.
  const hoursSinceRun = f.last_run_started_at
    ? (now - new Date(f.last_run_started_at).getTime()) / 3.6e6
    : null;
  if (hoursSinceRun === null || hoursSinceRun > STALE_RUN_HOURS) {
    alarms.push({
      code: 'STALE_PIPELINE',
      message:
        hoursSinceRun === null
          ? `No Apify runs ever recorded (threshold ${STALE_RUN_HOURS}h)`
          : `No Apify run for ${Math.round(hoursSinceRun)}h (threshold ${STALE_RUN_HOURS}h)`,
      detail: f.last_run_started_at ? `Last run: ${f.last_run_started_at}` : 'No runs in ingestion_runs table',
    });
  }

  // (2) Data is stale — runs may be firing but returning no new items.
  const hoursSinceData = f.last_new_listing_at
    ? (now - new Date(f.last_new_listing_at).getTime()) / 3.6e6
    : null;
  if (hoursSinceData !== null && hoursSinceData > STALE_DATA_HOURS) {
    alarms.push({
      code: 'STALE_DATA',
      message: `No new listings for ${Math.round(hoursSinceData)}h (threshold ${STALE_DATA_HOURS}h)`,
      detail:
        `Runs in last 24h: ${f.runs_24h}, successes: ${f.successes_24h}. ` +
        `Likely actor is broken or returning empty results.`,
    });
  }

  // (3) Most recent run errored.
  const recent = await sql<{ status: string; error_text: string | null; started_at: string; run_id: string }>`
    SELECT status, error_text, started_at::text, run_id
    FROM ingestion_runs
    ORDER BY started_at DESC
    LIMIT 1;
  `;
  if (recent.rows[0]?.status === 'failed') {
    alarms.push({
      code: 'LAST_RUN_ERRORED',
      message: `Most recent run failed`,
      detail: `Run ${recent.rows[0].run_id} at ${recent.rows[0].started_at}: ${recent.rows[0].error_text ?? '(no error_text)'}`,
    });
  }

  return alarms;
}

/**
 * Debounce: only fire an alarm to Telegram if we haven't fired the SAME
 * alarm code within the last NOTIFY_DEBOUNCE_HOURS. State is kept in a
 * lightweight `watchdog_state` table (created on first call).
 */
async function shouldNotify(code: Alarm['code']): Promise<boolean> {
  await sql`
    CREATE TABLE IF NOT EXISTS watchdog_state (
      code TEXT PRIMARY KEY,
      last_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  const r = await sql<{ last_notified_at: string }>`
    SELECT last_notified_at::text FROM watchdog_state WHERE code = ${code};
  `;
  if (r.rows.length === 0) {
    await sql`INSERT INTO watchdog_state (code) VALUES (${code}) ON CONFLICT (code) DO NOTHING;`;
    return true;
  }
  const lastAt = new Date(r.rows[0].last_notified_at).getTime();
  const hoursSince = (Date.now() - lastAt) / 3.6e6;
  if (hoursSince < NOTIFY_DEBOUNCE_HOURS) return false;
  await sql`UPDATE watchdog_state SET last_notified_at = NOW() WHERE code = ${code};`;
  return true;
}

async function notify(alarms: Alarm[]): Promise<{ sent: number; skipped: number }> {
  if (!isTelegramConfigured()) {
    console.log('[watchdog] Telegram not configured — skipping alerts', alarms);
    return { sent: 0, skipped: alarms.length };
  }
  const brokerChatId = process.env.LEADS_NOTIFY_TELEGRAM;
  if (!brokerChatId) {
    console.warn('[watchdog] LEADS_NOTIFY_TELEGRAM not set — no recipient');
    return { sent: 0, skipped: alarms.length };
  }

  let sent = 0;
  let skipped = 0;
  for (const a of alarms) {
    if (!(await shouldNotify(a.code))) {
      skipped++;
      console.log(`[watchdog] debounced ${a.code} — last alert <${NOTIFY_DEBOUNCE_HOURS}h ago`);
      continue;
    }
    const body =
      `🚨 *Below OP pipeline alert*\n\n` +
      `*${escapeMd(a.code)}*\n` +
      `${escapeMd(a.message)}\n\n` +
      (a.detail ? `_${escapeMd(a.detail)}_\n\n` : '') +
      `Check the dashboard: belowop\\-demo\\.vercel\\.app/admin/pipeline`;
    const r = await sendTelegram(brokerChatId, body);
    if (r.ok) sent++;
    else console.error('[watchdog] telegram send failed', r.error);
  }
  return { sent, skipped };
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: 'db not configured' }, { status: 503 });
  }

  try {
    const alarms = await checkAlarms();
    if (alarms.length === 0) {
      console.log('[watchdog] all checks pass — pipeline healthy');
      return NextResponse.json({ ok: true, healthy: true, alarms: [] });
    }
    const { sent, skipped } = await notify(alarms);
    console.log(`[watchdog] ${alarms.length} alarm(s): ${sent} sent, ${skipped} debounced`);
    return NextResponse.json({ ok: true, healthy: false, alarms, sent, skipped });
  } catch (e) {
    console.error('[watchdog] crashed', e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

// Also accept POST so manual triggers via curl don't need to remember the verb.
export const POST = GET;
