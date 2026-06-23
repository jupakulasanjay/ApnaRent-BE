-- Introduce "communities": an admin-curated grouping (apartment complex / villa
-- enclave / mixed development) that owns a location, amenities, photos, and a set
-- of member rentals/properties. Adds the communities + community_images tables,
-- their geo indexes, and a nullable community_id FK on listings + properties so
-- a unit can belong to one community (location/amenities stay denormalised on the
-- unit so existing search/geo keep working unchanged).
--
-- Forward-only; idempotent on retry. Run with `npm run db:migrate`.
-- config/schema/ embodies the same end state for fresh installs.

BEGIN;

CREATE TABLE IF NOT EXISTS communities (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  community_type    TEXT NOT NULL
                      CHECK (community_type IN ('apartment', 'villa', 'mixed')),
  towers            INTEGER,
  acres             NUMERIC(8, 2),

  address           TEXT,
  locality          TEXT,
  city              TEXT,
  state             TEXT,
  pincode           TEXT,
  latitude          NUMERIC(9, 6),
  longitude         NUMERIC(9, 6),

  amenities         TEXT[] NOT NULL DEFAULT '{}',
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_communities_city       ON communities (city);
CREATE INDEX IF NOT EXISTS idx_communities_locality   ON communities (locality);
CREATE INDEX IF NOT EXISTS idx_communities_type       ON communities (community_type);
CREATE INDEX IF NOT EXISTS idx_communities_created_at ON communities (created_at DESC);

-- Geo indexes (cube/earthdistance extensions already exist). Mirror the
-- properties earth + btree coverage.
CREATE INDEX IF NOT EXISTS idx_communities_earth
  ON communities USING GIST (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communities_lat_lng
  ON communities (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_images (
  id            SERIAL PRIMARY KEY,
  community_id  INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  image_url     TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_community_images_community ON community_images (community_id);

-- A listing/property may belong to one community. ON DELETE SET NULL so removing
-- a community detaches its members rather than deleting them.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS community_id INTEGER
  REFERENCES communities(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS community_id INTEGER
  REFERENCES communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listings_community   ON listings (community_id);
CREATE INDEX IF NOT EXISTS idx_properties_community ON properties (community_id);

COMMIT;
