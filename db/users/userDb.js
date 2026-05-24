import pool from "../../config/db.js";

const SAFE_COLUMNS = `id, email, name, phone, role, created_at`;

export async function findUserByEmailAndRole(email, role) {
  const { rows } = await pool.query(
    `SELECT ${SAFE_COLUMNS}, password_hash FROM users WHERE email = $1 AND role = $2`,
    [email, role],
  );
  return rows[0] || null;
}

export async function findUserByPhoneAndRole(phone, role) {
  const { rows } = await pool.query(
    `SELECT ${SAFE_COLUMNS} FROM users WHERE phone = $1 AND role = $2`,
    [phone, role],
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT ${SAFE_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function findUsersByIds(ids) {
  if (!ids?.length) return [];
  const { rows } = await pool.query(
    `SELECT ${SAFE_COLUMNS} FROM users WHERE id = ANY($1::int[])`,
    [ids],
  );
  return rows;
}

export async function createUser({ email, passwordHash, name, phone, role }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, phone, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SAFE_COLUMNS}`,
    [email, passwordHash, name || null, phone || null, role],
  );
  return rows[0];
}
