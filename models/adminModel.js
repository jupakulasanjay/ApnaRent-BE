import pool from "../config/db.js"

export async function findAdminByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, created_at FROM admins WHERE email = $1`,
    [email]
  )
  return rows[0] || null
}
