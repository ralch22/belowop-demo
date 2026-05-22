-- Below OP — initial schema
-- Run with: npm run db:migrate

CREATE TABLE IF NOT EXISTS listings (
  id              BIGSERIAL PRIMARY KEY,
  external_ref    TEXT UNIQUE NOT NULL,
  project         TEXT NOT NULL,
  developer       TEXT,
  community       TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('off_plan', 'ready')),
  beds            TEXT NOT NULL,
  sqft            INTEGER NOT NULL,
  current_price   BIGINT NOT NULL,
  original_price  BIGINT NOT NULL,
  source_image_urls TEXT[] DEFAULT '{}',
  blob_image_urls   TEXT[] DEFAULT '{}',
  blob_synced_at  TIMESTAMPTZ,
  listed_at       TIMESTAMPTZ NOT NULL,
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  withdrawn_at    TIMESTAMPTZ,
  raw             JSONB
);

CREATE INDEX IF NOT EXISTS idx_listings_listed_at ON listings(listed_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_type      ON listings(type);
CREATE INDEX IF NOT EXISTS idx_listings_community ON listings(community);
CREATE INDEX IF NOT EXISTS idx_listings_developer ON listings(developer);
CREATE INDEX IF NOT EXISTS idx_listings_active    ON listings(withdrawn_at) WHERE withdrawn_at IS NULL;

CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL PRIMARY KEY,
  listing_id  BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price       BIGINT NOT NULL,
  observed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history(listing_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS leads (
  id           BIGSERIAL PRIMARY KEY,
  listing_id   BIGINT REFERENCES listings(id),
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  message      TEXT,
  consent      BOOLEAN NOT NULL DEFAULT false,
  captured_at  TIMESTAMPTZ DEFAULT NOW(),
  ip_hash      TEXT,
  notified_at  TIMESTAMPTZ,
  notify_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_phone   ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_capture ON leads(captured_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'email')),
  contact         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  filters         JSONB DEFAULT '{}'::jsonb,
  confirm_token   TEXT UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  UNIQUE(channel, contact)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS alert_events (
  id             BIGSERIAL PRIMARY KEY,
  listing_id     BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('new_listing', 'price_drop')),
  prev_price     BIGINT,
  new_price      BIGINT NOT NULL,
  drop_pct       NUMERIC,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  dispatched_at  TIMESTAMPTZ,
  dispatch_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_events_pending ON alert_events(created_at) WHERE dispatched_at IS NULL;
