-- Stale-listing pruning (task #66, 2-miss conservative decision).
--
-- Tracks how many consecutive Apify runs failed to surface each active
-- listing. When miss_count >= 2 (i.e. two consecutive misses, NOT three —
-- pinned in earlier task description), we mark withdrawn_at = NOW().
--
-- Why 2 misses: protects against partial-scrape false positives. A single
-- scrape that returns 60/80 items must NOT mark the 20 missing listings as
-- withdrawn — they might just be on page 2 we didn't reach. Two consecutive
-- misses (over ~12h at 6-hourly cadence) is the right balance between
-- responsiveness and false-positive risk.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS miss_count       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at     TIMESTAMPTZ;

-- Listings we've seen in the current scrape window. Helps the watchdog
-- distinguish "no data" from "data didn't include known listings".
CREATE INDEX IF NOT EXISTS idx_listings_miss_count
  ON listings(miss_count)
  WHERE withdrawn_at IS NULL AND miss_count > 0;

-- For monitoring: how many listings would be auto-withdrawn on next run?
-- Used by /admin/pipeline and watchdog.
CREATE OR REPLACE VIEW v_listings_pruning_risk AS
SELECT
  COUNT(*) FILTER (WHERE miss_count = 1 AND withdrawn_at IS NULL)  AS one_miss,
  COUNT(*) FILTER (WHERE miss_count >= 2 AND withdrawn_at IS NULL) AS would_withdraw,
  COUNT(*) FILTER (WHERE last_seen_at IS NULL AND withdrawn_at IS NULL) AS never_re_seen,
  COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '24 hours' AND withdrawn_at IS NULL) AS fresh_24h
FROM listings;

-- Also: extend alert_events to support 'withdrawn' kind.
-- Existing CHECK constraint was kind IN ('new_listing','price_drop').
ALTER TABLE alert_events
  DROP CONSTRAINT IF EXISTS alert_events_kind_check;
ALTER TABLE alert_events
  ADD CONSTRAINT alert_events_kind_check
  CHECK (kind IN ('new_listing','price_drop','withdrawn'));
