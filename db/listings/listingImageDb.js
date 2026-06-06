import pool from "../../config/db.js";

export async function addListingImages(listingId, imageUrls) {
  if (!imageUrls?.length) return [];
  const values = imageUrls.map((_, i) => `($1, $${i + 2})`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO listing_images (listing_id, image_url)
     VALUES ${values}
     RETURNING id, listing_id, image_url, created_at`,
    [listingId, ...imageUrls],
  );
  return rows;
}

export async function listListingImages(listingId) {
  const { rows } = await pool.query(
    `SELECT id, listing_id, image_url, created_at
     FROM listing_images
     WHERE listing_id = $1
     ORDER BY created_at ASC`,
    [listingId],
  );
  return rows;
}

export async function getListingImage(listingId, imageId) {
  const { rows } = await pool.query(
    `SELECT id, listing_id, image_url, created_at
     FROM listing_images
     WHERE listing_id = $1 AND id = $2`,
    [listingId, imageId],
  );
  return rows[0] || null;
}

export async function deleteListingImage(listingId, imageId) {
  const { rowCount } = await pool.query(
    `DELETE FROM listing_images WHERE listing_id = $1 AND id = $2`,
    [listingId, imageId],
  );
  return rowCount > 0;
}
