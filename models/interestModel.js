import pool from "../config/db.js"

export async function addInterest(userId, propertyId) {
  const { rowCount } = await pool.query(
    `INSERT INTO interests (user_id, property_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, propertyId]
  )
  return rowCount > 0
}

export async function removeInterest(userId, propertyId) {
  const { rowCount } = await pool.query(
    `DELETE FROM interests WHERE user_id = $1 AND property_id = $2`,
    [userId, propertyId]
  )
  return rowCount > 0
}

export async function listUserInterests(userId) {
  const { rows } = await pool.query(
    `SELECT p.*, i.created_at AS interested_at
     FROM interests i
     JOIN properties p ON p.id = i.property_id
     WHERE i.user_id = $1 AND p.status = 'approved'
     ORDER BY i.created_at DESC`,
    [userId]
  )
  return rows
}
