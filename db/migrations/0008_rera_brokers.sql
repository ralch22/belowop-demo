-- Below OP — RERA broker registry (public verification directory)
--
-- Source: Dubai Land Department / RERA registered-broker export (Brokers.csv,
-- ~8,700 brokers across ~790 brokerages). This table powers the public
-- "/brokers" verification directory: a consumer can look up any Dubai agent and
-- confirm their RERA licence is genuine and current — the same model Vio
-- Brokers operates on the same public DLD data.
--
-- PRIVACY POSTURE (deliberate):
--   * `phone` is imported but treated as INTERNAL-ONLY. The public directory
--     queries (lib/db.ts fetchBrokers / fetchBrokerByNumber) never SELECT it.
--     Republishing personal contact numbers is the part of "public data" that
--     draws PDPL / DLD takedown heat, and it's also Below OP's lead-gen asset —
--     we don't give it away on a public page.
--   * `hidden_at` is a soft-hide for takedown / right-to-erasure requests; every
--     public query filters `hidden_at IS NULL`, so honouring a removal is a
--     single UPDATE with no data loss.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS, and the
-- RLS block (mirrors 0007) is safe to re-run. migrate.ts re-applies every file.

CREATE TABLE IF NOT EXISTS rera_brokers (
  id                    BIGSERIAL PRIMARY KEY,
  broker_number         TEXT UNIQUE NOT NULL,      -- RERA broker number (public id / slug)
  participant_id        TEXT,
  real_estate_broker_id TEXT,
  name_en               TEXT NOT NULL,
  name_ar               TEXT,
  gender                SMALLINT,                  -- source coding: 0 / 1
  license_start         DATE,
  license_end           DATE,
  webpage               TEXT,                      -- firm website (raw, from DLD)
  firm_domain           TEXT,                      -- normalised host of webpage (www-stripped)
  firm_name             TEXT,                      -- display name derived from domain
  phone                 TEXT,                      -- INTERNAL ONLY — never selected on public pages
  real_estate_id        TEXT,                      -- brokerage id
  real_estate_number    TEXT,                      -- brokerage licence number
  source                TEXT NOT NULL DEFAULT 'dld_csv',
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hidden_at             TIMESTAMPTZ                -- soft-hide for takedown / erasure requests
);

-- Filter/sort helpers. The table is small (~8.7k rows) so ILIKE search runs as
-- a fast seq-scan; these indexes cover the status filter, firm grouping, and
-- the active-only ordering.
CREATE INDEX IF NOT EXISTS idx_rera_brokers_license_end  ON rera_brokers (license_end);
CREATE INDEX IF NOT EXISTS idx_rera_brokers_firm_domain  ON rera_brokers (firm_domain);
CREATE INDEX IF NOT EXISTS idx_rera_brokers_hidden       ON rera_brokers (hidden_at);
CREATE INDEX IF NOT EXISTS idx_rera_brokers_name_lower   ON rera_brokers (lower(name_en));

-- Row-Level Security — same defensive posture as 0007. The app connects as the
-- table owner (bypasses RLS), so reads/writes keep working; a non-privileged /
-- anonymous role gets default-deny. The directory is public *content*, but it's
-- served by the app role, not by exposing the table to anon Postgres clients.
DO $$
DECLARE
  app_role text := current_user;
BEGIN
  IF to_regclass('public.rera_brokers') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.rera_brokers ENABLE ROW LEVEL SECURITY';
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.rera_brokers TO %I;', app_role);
  EXECUTE 'DROP POLICY IF EXISTS belowop_app_full ON public.rera_brokers';
  EXECUTE format(
    'CREATE POLICY belowop_app_full ON public.rera_brokers FOR ALL TO %I USING (true) WITH CHECK (true);',
    app_role
  );
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rera_brokers FROM PUBLIC';
  EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I;', app_role);
END $$;
