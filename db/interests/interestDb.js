import pool from "../../config/db.js";

const INTEREST_COLS = `id, user_id, listing_id, created_at`;

export async function createInterest({ userId, listingId }) {
  const { rows } = await pool.query(
    `INSERT INTO interests (user_id, listing_id)
     VALUES ($1, $2)
     RETURNING ${INTEREST_COLS}`,
    [userId, listingId],
  );
  return rows[0];
}

export async function findInterestForUserListing(userId, listingId) {
  const { rows } = await pool.query(
    `SELECT ${INTEREST_COLS} FROM interests
     WHERE user_id = $1 AND listing_id = $2`,
    [userId, listingId],
  );
  return rows[0] || null;
}

export async function listInterestsByUser(userId) {
  const { rows } = await pool.query(
    `SELECT ${INTEREST_COLS} FROM interests
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function deleteInterestForUserListing(userId, listingId) {
  const { rowCount } = await pool.query(
    `DELETE FROM interests
     WHERE user_id = $1 AND listing_id = $2`,
    [userId, listingId],
  );
  return rowCount > 0;
}
