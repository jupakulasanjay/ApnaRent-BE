CREATE TABLE IF NOT EXISTS properties (
  id                 SERIAL PRIMARY KEY,

  -- Listing
  title              TEXT NOT NULL,
  description        TEXT,
  price              INTEGER NOT NULL,

  -- Address (populated via geocoding API response)
  address_line       TEXT,         -- street + number (e.g. "12, MG Road")
  building_name      TEXT,         -- society / apartment / tower
  landmark           TEXT,         -- free-form nearby reference
  sub_locality       TEXT,         -- e.g. "6th Block"
  locality           TEXT,         -- e.g. "Koramangala"
  city               TEXT,         -- e.g. "Bengaluru"
  district           TEXT,         -- administrative_area_level_2
  state              TEXT,         -- administrative_area_level_1
  country            TEXT,
  country_code       TEXT,         -- ISO 3166-1 alpha-2, e.g. "IN"
  pincode            TEXT,         -- postal_code
  formatted_address  TEXT,         -- full single-line address from API
  place_id           TEXT,         -- provider place identifier (Google/Mapbox)

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
