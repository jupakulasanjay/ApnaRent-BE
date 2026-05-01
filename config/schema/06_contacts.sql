CREATE TABLE IF NOT EXISTS contacts (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id   INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  property_id  INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (listing_id IS NOT NULL AND property_id IS NULL) OR
    (listing_id IS NULL AND property_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_contacts_user     ON contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_listing  ON contacts (listing_id);
CREATE INDEX IF NOT EXISTS idx_contacts_property ON contacts (property_id);
