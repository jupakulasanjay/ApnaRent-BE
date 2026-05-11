CREATE TABLE IF NOT EXISTS listings (
  id                SERIAL PRIMARY KEY,
  owner_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title             TEXT NOT NULL,
  description       TEXT,
  rent              INTEGER NOT NULL,
  bhk               INTEGER,
  bathrooms         INTEGER,
  furnishing        TEXT,
  available_from    DATE,

  address           TEXT NOT NULL,
  locality          TEXT,
  city              TEXT,
  state             TEXT,
  pincode           TEXT,
  latitude          NUMERIC(9, 6),
  longitude         NUMERIC(9, 6),

  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'pending_verification', 'active', 'rejected', 'expired')),
  rejection_reason  TEXT,
  approved_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMP,
  amenities         TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_listings_owner      ON listings (owner_id);
CREATE INDEX IF NOT EXISTS idx_listings_status     ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_city       ON listings (city);
CREATE INDEX IF NOT EXISTS idx_listings_locality   ON listings (locality);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings (created_at DESC);
