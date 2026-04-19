CREATE TABLE IF NOT EXISTS properties (
  id                 SERIAL PRIMARY KEY,

  -- Listing
  title              TEXT NOT NULL,
  description        TEXT,
  price              INTEGER NOT NULL,

  -- Ownership + moderation
  owner_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejected_reason    TEXT,
  approved_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at        TIMESTAMP,

  -- Address (populated via geocoding API response)
  address_line       TEXT,
  building_name      TEXT,
  landmark           TEXT,
  sub_locality       TEXT,
  locality           TEXT,
  city               TEXT,
  district           TEXT,
  state              TEXT,
  country            TEXT,
  country_code       TEXT,
  pincode            TEXT,
  formatted_address  TEXT,
  place_id           TEXT,

  -- Geo
  latitude           DECIMAL(9, 6),
  longitude          DECIMAL(9, 6),

  -- Media
  images             TEXT[] DEFAULT '{}',

  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_properties_city        ON properties (city);
CREATE INDEX IF NOT EXISTS idx_properties_locality    ON properties (locality);
CREATE INDEX IF NOT EXISTS idx_properties_pincode     ON properties (pincode);
CREATE INDEX IF NOT EXISTS idx_properties_lat_lng     ON properties (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_properties_place_id    ON properties (place_id);
CREATE INDEX IF NOT EXISTS idx_properties_created_at  ON properties (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_owner       ON properties (owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_status      ON properties (status);
