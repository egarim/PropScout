-- Core tables for PropScout

SET search_path = public;

-- ── Data Sources ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_sources (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,       -- 'redfin', 'zillow'
  display_name TEXT NOT NULL,
  enabled     BOOLEAN DEFAULT true,
  config      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Apify Settings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apify_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id       UUID REFERENCES data_sources(id) ON DELETE CASCADE,
  actor_id        TEXT NOT NULL,           -- e.g. 'apify/redfin-scraper'
  api_token       TEXT,                    -- override global token
  max_items       INTEGER DEFAULT 100,
  memory_mb       INTEGER DEFAULT 512,
  input_template  JSONB DEFAULT '{}',      -- default actor input
  webhook_url     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Scrape Schedules ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_schedules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id   UUID REFERENCES data_sources(id) ON DELETE CASCADE,
  zip_codes   TEXT[] NOT NULL,
  cron_expr   TEXT NOT NULL,               -- e.g. '0 2 * * *'
  enabled     BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Scrape Jobs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id     UUID REFERENCES scrape_schedules(id),
  source_id       UUID REFERENCES data_sources(id),
  apify_run_id    TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending/running/done/failed
  zip_codes       TEXT[],
  records_scraped INTEGER DEFAULT 0,
  images_saved    INTEGER DEFAULT 0,
  errors          JSONB DEFAULT '[]',
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Properties ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id       UUID REFERENCES data_sources(id),
  external_id     TEXT NOT NULL,           -- ID from source site
  address         TEXT NOT NULL,
  city            TEXT,
  state           TEXT,
  zip_code        TEXT,
  lat             DOUBLE PRECISION,        -- written directly by the scraper ingest
  lng             DOUBLE PRECISION,
  status          TEXT,                   -- active/sold/pending
  property_type   TEXT,                   -- house/condo/townhouse
  current_price   NUMERIC(12,2),
  details         JSONB DEFAULT '{}',     -- flexible: beds, baths, sqft, etc.
  raw_data        JSONB DEFAULT '{}',     -- full original scrape response
  last_scraped_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, external_id)
);

-- Fuzzy text search index
CREATE INDEX IF NOT EXISTS idx_properties_address_trgm
  ON properties USING GIN(address gin_trgm_ops);

-- JSONB index for details
CREATE INDEX IF NOT EXISTS idx_properties_details
  ON properties USING GIN(details);

-- ── Property History ──────────────────────────────────────
-- One row per price/status change, written by trigger so every write path is covered
CREATE TABLE IF NOT EXISTS property_history (
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  old_price   NUMERIC(12,2),
  price       NUMERIC(12,2),
  status      TEXT,
  event       TEXT NOT NULL              -- 'listed','price_drop','price_increase','status_change'
);

CREATE INDEX IF NOT EXISTS idx_property_history_property
  ON property_history(property_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_property_history_event
  ON property_history(event, time DESC);

CREATE OR REPLACE FUNCTION log_property_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO property_history(property_id, price, status, event)
    VALUES (NEW.id, NEW.current_price, NEW.status, 'listed');
  ELSIF NEW.current_price IS DISTINCT FROM OLD.current_price
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO property_history(property_id, old_price, price, status, event)
    VALUES (NEW.id, OLD.current_price, NEW.current_price, NEW.status,
      CASE WHEN NEW.current_price < OLD.current_price THEN 'price_drop'
           WHEN NEW.current_price > OLD.current_price THEN 'price_increase'
           ELSE 'status_change' END);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_history ON properties;
CREATE TRIGGER trg_property_history
  AFTER INSERT OR UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION log_property_history();

-- ── Property Images ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,             -- public MinIO URL (served via /img/)
  minio_key   TEXT,                      -- object key inside the bucket
  is_primary  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Contacts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_channels (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id  UUID REFERENCES contacts(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,              -- 'telegram','whatsapp','sms'
  identifier  TEXT NOT NULL,             -- chat_id, phone number, etc.
  status      TEXT NOT NULL DEFAULT 'pending', -- pending/approved/denied/blocked
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  last_seen   TIMESTAMPTZ,
  query_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel, identifier)
);

-- ── Agent Sessions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id  UUID REFERENCES contact_channels(id) ON DELETE CASCADE,
  messages    JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_queries (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id     UUID REFERENCES agent_sessions(id),
  channel_id     UUID REFERENCES contact_channels(id),
  user_id        TEXT,                    -- channel-native user id (telegram id, 'web', etc.)
  channel        TEXT,                    -- 'telegram' / 'web' / ...
  query          TEXT NOT NULL,
  response       TEXT,
  tool_calls     JSONB DEFAULT '[]',
  intent         TEXT,                    -- property_search / zip_comparison / market_stats / general
  zips_mentioned TEXT[],
  price_min      NUMERIC,
  price_max      NUMERIC,
  beds_requested INTEGER,
  tokens_in      INTEGER,
  tokens_out     INTEGER,
  tokens_used    INTEGER,
  cost_usd       NUMERIC(12,6),
  language       TEXT DEFAULT 'en',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

SELECT 'Schema created' AS status;
