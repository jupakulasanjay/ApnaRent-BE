-- A listing/property may belong to one community. ON DELETE SET NULL so removing
-- a community detaches its members rather than deleting them. Lives here (after
-- 10_communities.sql) because the FK target must already exist.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS community_id INTEGER
  REFERENCES communities(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS community_id INTEGER
  REFERENCES communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listings_community   ON listings (community_id);
CREATE INDEX IF NOT EXISTS idx_properties_community ON properties (community_id);
