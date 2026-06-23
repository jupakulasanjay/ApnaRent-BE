import pool from "../../config/db.js";

export async function addCommunityImages(communityId, imageUrls) {
  if (!imageUrls?.length) return [];
  const values = imageUrls.map((_, i) => `($1, $${i + 2})`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO community_images (community_id, image_url)
     VALUES ${values}
     RETURNING id, community_id, image_url, created_at`,
    [communityId, ...imageUrls],
  );
  return rows;
}

export async function listCommunityImages(communityId) {
  const { rows } = await pool.query(
    `SELECT id, community_id, image_url, created_at
     FROM community_images
     WHERE community_id = $1
     ORDER BY created_at ASC`,
    [communityId],
  );
  return rows;
}

export async function getCommunityImage(communityId, imageId) {
  const { rows } = await pool.query(
    `SELECT id, community_id, image_url, created_at
     FROM community_images
     WHERE community_id = $1 AND id = $2`,
    [communityId, imageId],
  );
  return rows[0] || null;
}

export async function deleteCommunityImage(communityId, imageId) {
  const { rowCount } = await pool.query(
    `DELETE FROM community_images WHERE community_id = $1 AND id = $2`,
    [communityId, imageId],
  );
  return rowCount > 0;
}
