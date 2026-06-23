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

CREATE INDEX IF NOT EXISTS idx_communities_earth
  ON communities USING GIST (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communities_lat_lng
  ON communities (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
