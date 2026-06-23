-- Re-introduce the for-sale "properties" feature, mirroring the rentals
-- (listings) vertical with `price` in place of `rent`. Adds the properties +
-- property_images tables, their geo indexes, and restores the property_id
-- target column + XOR guard on contacts.
--
-- Forward-only; idempotent on retry. Run with `npm run db:migrate`.
-- config/schema/ embodies the same end state for fresh installs.

BEGIN;

CREATE TABLE IF NOT EXISTS properties (
  id                SERIAL PRIMARY KEY,
  owner_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title             TEXT NOT NULL,
  description       TEXT,
  price             INTEGER NOT NULL,
  property_type     TEXT NOT NULL
                      CHECK (property_type IN ('residential', 'plot', 'commercial')),
  area              INTEGER NOT NULL,
  property_facing   TEXT NOT NULL
                      CHECK (property_facing IN ('north', 'south', 'east', 'west',
                                                 'north_east', 'north_west',
                                                 'south_east', 'south_west')),

  -- residential-only
  floors            INTEGER,
  bhk               INTEGER,
  bathrooms         INTEGER,
  balcony           INTEGER,
  -- plot-only
  boundary_wall     BOOLEAN,
  -- commercial-only
  cabins            INTEGER,

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

CREATE INDEX IF NOT EXISTS idx_properties_owner      ON properties (owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_status     ON properties (status);
CREATE INDEX IF NOT EXISTS idx_properties_type       ON properties (property_type);
CREATE INDEX IF NOT EXISTS idx_properties_city       ON properties (city);
CREATE INDEX IF NOT EXISTS idx_properties_locality   ON properties (locality);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties (created_at DESC);

CREATE TABLE IF NOT EXISTS property_images (
  id           SERIAL PRIMARY KEY,
  property_id  INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  image_url    TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_property_images_property ON property_images (property_id);

-- Geo indexes (cube/earthdistance extensions already exist from 005/the
-- localities schema). Mirror the listings earth + btree coverage.
CREATE INDEX IF NOT EXISTS idx_properties_earth
  ON properties USING GIST (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_lat_lng
  ON properties (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- contacts: re-add the property target column, the XOR guard (a contact may
-- point at a listing OR a property, never both), and its lookup index.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS property_id INTEGER
  REFERENCES properties(id) ON DELETE CASCADE;

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_target_not_both;
ALTER TABLE contacts ADD CONSTRAINT contacts_target_not_both
  CHECK (NOT (listing_id IS NOT NULL AND property_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_contacts_property ON contacts (property_id);

COMMIT;
