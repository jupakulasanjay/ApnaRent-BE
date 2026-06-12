BEGIN;

-- property_type stays; ensure it exists for any DB that predates 009.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_type TEXT;

ALTER TABLE properties DROP COLUMN IF EXISTS area;
ALTER TABLE properties DROP COLUMN IF EXISTS property_facing;
ALTER TABLE properties DROP COLUMN IF EXISTS floors;
ALTER TABLE properties DROP COLUMN IF EXISTS balcony;
ALTER TABLE properties DROP COLUMN IF EXISTS boundary_wall;
ALTER TABLE properties DROP COLUMN IF EXISTS cabins;
ALTER TABLE properties DROP COLUMN IF EXISTS bhk;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS furnishing     TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS available_from DATE;

-- Backfill a default type for any pre-existing rows so NOT NULL can be set.
UPDATE properties SET property_type = 'residential' WHERE property_type IS NULL;

ALTER TABLE properties
  ALTER COLUMN property_type SET NOT NULL;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_property_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_property_type_check
  CHECK (property_type IN ('residential', 'plot', 'commercial'));

CREATE INDEX IF NOT EXISTS idx_properties_type ON properties (property_type);

COMMIT;
