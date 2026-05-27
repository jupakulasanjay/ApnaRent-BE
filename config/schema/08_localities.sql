-- Required by ll_to_earth / earth_box / earth_distance used in geo-radius
-- search. Both extensions ship with the default Postgres distribution.
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

CREATE TABLE IF NOT EXISTS localities (
  id           SERIAL PRIMARY KEY,
  city         TEXT,
  locality     TEXT NOT NULL,
  latitude     NUMERIC(9, 6) NOT NULL,
  longitude    NUMERIC(9, 6) NOT NULL,
  source       TEXT NOT NULL DEFAULT 'google',
  resolved_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_localities_city_locality
  ON localities (lower(coalesce(city, '')), lower(locality));

CREATE INDEX IF NOT EXISTS idx_listings_earth
  ON listings USING GIST (ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
