-- Broker template fields (per Jad's canonical post format).
-- See Variables.pdf and CLAUDE.md §X for the source of truth.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS unit_type      TEXT,
  ADD COLUMN IF NOT EXISTS bathrooms      INTEGER,
  ADD COLUMN IF NOT EXISTS features       TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS view           TEXT,
  ADD COLUMN IF NOT EXISTS floor_position TEXT,
  ADD COLUMN IF NOT EXISTS handover       TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS plot_size_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS bua_sqft       INTEGER,
  ADD COLUMN IF NOT EXISTS sub_location   TEXT,
  ADD COLUMN IF NOT EXISTS furnished      TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_handover ON listings(handover) WHERE handover IS NOT NULL;
