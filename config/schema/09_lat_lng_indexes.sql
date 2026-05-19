-- Composite btree indexes on (latitude, longitude) for listings and
-- properties. The existing GiST `idx_*_earth` indexes already power
-- earth_box containment for radius queries; these btrees additionally
-- help simple range/equality scans (e.g. NULL-coord checks, future
-- bounding-box visualisations) and bound the row set on non-radius
-- filtered queries.
CREATE INDEX IF NOT EXISTS idx_listings_lat_lng
  ON listings (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_lat_lng
  ON properties (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
