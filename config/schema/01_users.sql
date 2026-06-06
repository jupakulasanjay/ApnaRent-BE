CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  name           TEXT,
  phone          TEXT,
  role           TEXT NOT NULL CHECK (role IN ('tenant', 'owner', 'admin')),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (email, role),
  UNIQUE (phone, role)
);

CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
