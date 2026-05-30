-- Below OP — single-use unsubscribe tokens (HIGH-priority security block)
--
-- Adds a consumption marker for signed unsubscribe tokens. The token itself is
-- stateless (HMAC-signed sid + expiry, see lib/tokens.ts); this column makes
-- the action single-use: the first valid unsubscribe stamps unsub_used_at, and
-- any replay finds it already set.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Safe to re-run (migrate.ts re-applies
-- every .sql file each run).

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS unsub_used_at TIMESTAMPTZ;
