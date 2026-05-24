-- Composite btree index on (latitude, longitude) for listings. The existing
-- GiST `idx_listings_earth` index powers earth_box containment for radius
-- queries; this btree additionally helps simple range/equality scans (e.g.
-- NULL-coord checks, future bounding-box visualisations) and bounds the row
-- set on non-radius filtered queries.
CREATE INDEX IF NOT EXISTS idx_listings_lat_lng
  ON listings (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
