-- Geo-radius search support.
-- earthdistance ships with default Postgres distributions (incl. RDS managed PG).
-- It depends on cube; both are idempotent via CREATE EXTENSION IF NOT EXISTS.
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- Centroid cache for (city, locality) pairs. Populated lazily by the
-- geocode service on first lookup. Source tracks which provider resolved it
-- (currently "google") so we can re-resolve if we ever change providers.
CREATE TABLE IF NOT EXISTS localities (
  id           SERIAL PRIMARY KEY,
  city         TEXT,
  locality     TEXT NOT NULL,
  latitude     NUMERIC(9, 6) NOT NULL,
  longitude    NUMERIC(9, 6) NOT NULL,
  source       TEXT NOT NULL DEFAULT 'google',
  resolved_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Case-insensitive uniqueness — coalesce() so NULL city still deduplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_localities_city_locality
  ON localities (lower(coalesce(city, '')), lower(locality));

-- GiST indexes for earth_box() containment queries. Partial — only index
-- rows that actually have coordinates, since NULL-coord rows take the
-- literal-ILIKE fallback path.
CREATE INDEX IF NOT EXISTS idx_listings_earth
  ON listings USING GIST (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_earth
  ON properties USING GIST (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
