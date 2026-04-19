import pool from "../config/db.js"

const SAFE_COLUMNS = `id, email, name, phone, role, status, rejected_reason, approved_by, approved_at, created_at`

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${SAFE_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email]
  )
  return rows[0] || null
}

export async function findUserById(id) {
  const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = $1`, [id])
  return rows[0] || null
}

export async function createUser({ email, passwordHash, name, phone, role, status }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, phone, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SAFE_COLUMNS}`,
    [email, passwordHash, name || null, phone || null, role, status]
  )
  return rows[0]
}

export async function listUsers({ role, status, limit = 50, offset = 0 }) {
  const where = []
  const params = []
  let i = 1
  if (role) { where.push(`role = $${i++}`); params.push(role) }
  if (status) { where.push(`status = $${i++}`); params.push(status) }
  params.push(limit, offset)

  const sql = `
    SELECT ${SAFE_COLUMNS} FROM users
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY created_at DESC
    LIMIT $${i++} OFFSET $${i++}
  `
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function approveUserById(id, approverId) {
  const { rows } = await pool.query(
    `UPDATE users
     SET status = 'active',
         approved_by = $2,
         approved_at = NOW(),
         rejected_reason = NULL
     WHERE id = $1
     RETURNING ${SAFE_COLUMNS}`,
    [id, approverId]
  )
  return rows[0] || null
}

export async function rejectUserById(id, approverId, reason) {
  const { rows } = await pool.query(
    `UPDATE users
     SET status = 'rejected',
         approved_by = $2,
         rejected_reason = $3
     WHERE id = $1
     RETURNING ${SAFE_COLUMNS}`,
    [id, approverId, reason || null]
  )
  return rows[0] || null
}
