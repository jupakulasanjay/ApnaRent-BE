CREATE TABLE IF NOT EXISTS contacts (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id   INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  subject      TEXT,
  message      TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_user    ON contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_listing ON contacts (listing_id);
