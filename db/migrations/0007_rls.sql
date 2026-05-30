-- Below OP — Row-Level Security (HIGH-priority security block)
--
-- Goal: a non-owner / anonymous Postgres role must not be able to read or write
-- the application tables. The app connects as a single trusted Neon role.
--
-- Strategy (defensive — safe under either Neon role model):
--   1. ENABLE ROW LEVEL SECURITY on each table. With RLS enabled and no
--      permissive policy, a non-privileged role sees zero rows and every write
--      is denied (default-deny). A table OWNER bypasses RLS, so an app that
--      owns its tables keeps working unchanged.
--   2. GRANT the app's own role explicit table + sequence privileges and add a
--      permissive policy scoped to that role, so the app keeps full access even
--      if it is NOT the table owner. `current_user` here is the migration-runner
--      role, which is the same Neon role the app connects with.
--   3. REVOKE write privileges from PUBLIC as defense-in-depth.
--
-- We deliberately do NOT use FORCE ROW LEVEL SECURITY — that would subject the
-- owner to policies too, turning a policy mistake into an outage.
--
-- Idempotent: ENABLE RLS / GRANT / REVOKE are no-ops on re-run; the policy is
-- dropped and recreated. migrate.ts re-applies every .sql file each run.
--
-- VERIFY AFTER APPLYING (must still return rows / succeed as the app role):
--   SELECT count(*) FROM listings;                       -- read works
--   INSERT INTO ingestion_runs (run_id, dataset_id, status)
--     VALUES ('rls-smoke', 'rls-smoke', 'running')
--     ON CONFLICT (run_id) DO NOTHING;                   -- write works
--   DELETE FROM ingestion_runs WHERE run_id = 'rls-smoke';
-- And confirm the live site still lists properties + lead capture works.

DO $$
DECLARE
  app_role text := current_user;
  t text;
  tables text[] := ARRAY[
    'listings', 'price_history', 'leads',
    'subscriptions', 'alert_events', 'ingestion_runs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip tables that don't exist yet (defensive across environments).
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    -- Ensure the app role has direct privileges, so the REVOKE below can never
    -- strip the app's own access (privilege checks run before RLS policies).
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO %I;', t, app_role);

    -- (Re)create the permissive full-access policy for the app role only.
    EXECUTE format('DROP POLICY IF EXISTS belowop_app_full ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY belowop_app_full ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true);',
      t, app_role
    );

    -- Defense-in-depth: anonymous / PUBLIC roles lose all write access.
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC;', t);
  END LOOP;

  -- BIGSERIAL inserts need sequence access; grant it to the app role directly.
  EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I;', app_role);
END $$;
