-- Moves the amenities catalogue from config/amenities.js into the DB so it can
-- be edited at runtime, and adds the GIN index needed for fast contains/overlap
-- queries on listings.amenities (now used by search filters).

CREATE TABLE IF NOT EXISTS amenity_icons (
  slug TEXT PRIMARY KEY,
  svg  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS amenities (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL,
  label       TEXT NOT NULL,
  icon        TEXT NOT NULL,
  category    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (slug, kind)
);

CREATE INDEX IF NOT EXISTS idx_amenities_kind ON amenities (kind);

-- Speed up "listing has any/all of these amenities" lookups on the search path.
CREATE INDEX IF NOT EXISTS idx_listings_amenities
  ON listings USING GIN (amenities);
