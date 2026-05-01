CREATE TABLE IF NOT EXISTS interests (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id   INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  property_id  INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (listing_id IS NOT NULL AND property_id IS NULL) OR
    (listing_id IS NULL AND property_id IS NOT NULL)
  ),
  UNIQUE (user_id, listing_id),
  UNIQUE (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_interests_user            ON interests (user_id);
CREATE INDEX IF NOT EXISTS idx_interests_user_created_at ON interests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interests_listing         ON interests (listing_id);
CREATE INDEX IF NOT EXISTS idx_interests_property        ON interests (property_id);
