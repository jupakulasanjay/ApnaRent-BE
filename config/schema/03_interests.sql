CREATE TABLE IF NOT EXISTS interests (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id  INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_interests_property ON interests (property_id);
