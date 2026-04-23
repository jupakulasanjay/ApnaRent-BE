CREATE TABLE IF NOT EXISTS properties (
  id                SERIAL PRIMARY KEY,
  owner_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title             TEXT NOT NULL,
  description       TEXT,
  price             INTEGER NOT NULL,
  property_type     TEXT NOT NULL
                      CHECK (property_type IN ('land', 'plot', 'apartment', 'villa', 'house', 'commercial')),
  area_sqft         INTEGER,

  address           TEXT NOT NULL,
  locality          TEXT,
  city              TEXT,

  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'pending_verification', 'active', 'rejected', 'expired')),
  rejection_reason  TEXT,
  approved_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_properties_owner      ON properties (owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_status     ON properties (status);
CREATE INDEX IF NOT EXISTS idx_properties_city       ON properties (city);
CREATE INDEX IF NOT EXISTS idx_properties_locality   ON properties (locality);
CREATE INDEX IF NOT EXISTS idx_properties_type       ON properties (property_type);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties (created_at DESC);
