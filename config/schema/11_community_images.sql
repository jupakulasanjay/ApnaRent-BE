CREATE TABLE IF NOT EXISTS community_images (
  id            SERIAL PRIMARY KEY,
  community_id  INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  image_url     TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_community_images_community ON community_images (community_id);
