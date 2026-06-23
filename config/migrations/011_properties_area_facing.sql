-- Re-introduce `area` (sq.ft.) and `property_facing` on properties so the
-- property search/browse can filter on them (min_area/max_area + facing[]).
-- Both nullable. Idempotent.
--
-- Forward-only. Run with `npm run db:migrate`.

BEGIN;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS area            INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_facing TEXT;

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_property_facing_check;
ALTER TABLE properties ADD CONSTRAINT properties_property_facing_check
  CHECK (property_facing IS NULL OR property_facing IN
    ('north', 'south', 'east', 'west',
     'north_east', 'north_west', 'south_east', 'south_west'));

CREATE INDEX IF NOT EXISTS idx_properties_facing ON properties (property_facing);

COMMIT;
