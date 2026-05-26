-- Ingestion observability — one row per Apify webhook invocation.
-- Foundation for /admin/pipeline (task #67), stale-listing pruning (#66),
-- and the watchdog cron (#68).

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id                BIGSERIAL PRIMARY KEY,
  run_id            TEXT NOT NULL UNIQUE,             -- Apify actor run id
  dataset_id        TEXT NOT NULL,
  actor_name        TEXT,                              -- e.g. 'shahidirfan/Propertyfinder-Scraper'
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,                       -- NULL while in progress
  items_received    INTEGER NOT NULL DEFAULT 0,        -- raw items from dataset
  items_inserted    INTEGER NOT NULL DEFAULT 0,        -- new listings created
  items_updated     INTEGER NOT NULL DEFAULT 0,        -- existing listings updated
  items_unchanged   INTEGER NOT NULL DEFAULT 0,        -- received but no change
  items_withdrawn   INTEGER NOT NULL DEFAULT 0,        -- marked stale this run (task #66 only)
  items_errored     INTEGER NOT NULL DEFAULT 0,        -- per-item parse / upsert failures
  status            TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','succeeded','failed','partial')),
  error_text        TEXT,                              -- top-level error if status='failed'
  raw_stats         JSONB DEFAULT '{}'::jsonb          -- full stats blob for forensics
);

-- Common query patterns:
--   "what was the most recent run?"
--   "show last 30 days of runs"
--   "find runs that errored"
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started ON ingestion_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status  ON ingestion_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_run_id  ON ingestion_runs(run_id);

-- Helper view: most recent run summary.
-- Used by /admin/pipeline header card + watchdog cron.
CREATE OR REPLACE VIEW v_ingestion_freshness AS
SELECT
  (SELECT MAX(started_at) FROM ingestion_runs)                                AS last_run_started_at,
  (SELECT MAX(completed_at) FROM ingestion_runs WHERE status='succeeded')     AS last_success_at,
  (SELECT COUNT(*) FROM ingestion_runs
     WHERE started_at >= NOW() - INTERVAL '24 hours')                          AS runs_24h,
  (SELECT COUNT(*) FROM ingestion_runs
     WHERE started_at >= NOW() - INTERVAL '24 hours' AND status='succeeded')   AS successes_24h,
  (SELECT MAX(first_seen_at) FROM listings)                                    AS last_new_listing_at,
  (SELECT COUNT(*) FROM listings
     WHERE first_seen_at >= NOW() - INTERVAL '24 hours')                       AS new_listings_24h,
  (SELECT COUNT(*) FROM listings
     WHERE updated_at >= NOW() - INTERVAL '24 hours')                          AS updates_24h,
  (SELECT COUNT(*) FROM listings
     WHERE withdrawn_at >= NOW() - INTERVAL '24 hours')                        AS withdrawn_24h,
  (SELECT COUNT(*) FROM listings WHERE withdrawn_at IS NULL)                   AS active_listings_total;
