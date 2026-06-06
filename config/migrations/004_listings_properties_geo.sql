-- Add geo (lat/lng) and richer address fields (pincode, state) to listings and properties.
-- All nullable — existing rows are unaffected.

ALTER TABLE listings   ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6);
ALTER TABLE listings   ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);
ALTER TABLE listings   ADD COLUMN IF NOT EXISTS pincode   TEXT;
ALTER TABLE listings   ADD COLUMN IF NOT EXISTS state     TEXT;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS pincode   TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS state     TEXT;
