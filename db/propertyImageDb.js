import pool from "../config/db.js"

export async function addPropertyImages(propertyId, imageUrls) {
  if (!imageUrls?.length) return []
  const values = imageUrls.map((_, i) => `($1, $${i + 2})`).join(", ")
  const { rows } = await pool.query(
    `INSERT INTO property_images (property_id, image_url)
     VALUES ${values}
     RETURNING id, property_id, image_url, created_at`,
    [propertyId, ...imageUrls]
  )
  return rows
}

export async function listPropertyImages(propertyId) {
  const { rows } = await pool.query(
    `SELECT id, property_id, image_url, created_at
     FROM property_images
     WHERE property_id = $1
     ORDER BY created_at ASC`,
    [propertyId]
  )
  return rows
}

export async function getPropertyImage(propertyId, imageId) {
  const { rows } = await pool.query(
    `SELECT id, property_id, image_url, created_at
     FROM property_images
     WHERE property_id = $1 AND id = $2`,
    [propertyId, imageId]
  )
  return rows[0] || null
}

export async function deletePropertyImage(propertyId, imageId) {
  const { rowCount } = await pool.query(
    `DELETE FROM property_images WHERE property_id = $1 AND id = $2`,
    [propertyId, imageId]
  )
  return rowCount > 0
}
