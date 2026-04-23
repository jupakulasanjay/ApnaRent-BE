import pool from "../config/db.js"

export async function createContact({ userId, listingId = null, propertyId = null, message }) {
  const { rows } = await pool.query(
    `INSERT INTO contacts (user_id, listing_id, property_id, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, listing_id, property_id, message, created_at`,
    [userId, listingId, propertyId, message]
  )
  return rows[0]
}
