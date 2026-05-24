import pool from "../config/db.js";

const CONTACT_COLS = `id, user_id, listing_id, subject, message, created_at`;

export async function createContact({
  userId,
  listingId = null,
  subject = null,
  message,
}) {
  const { rows } = await pool.query(
    `INSERT INTO contacts (user_id, listing_id, subject, message)
     VALUES ($1, $2, $3, $4)
     RETURNING ${CONTACT_COLS}`,
    [userId, listingId, subject, message],
  );
  return rows[0];
}

export async function listAllContacts({ kind } = {}) {
  let where = "";
  if (kind === "listing") where = "WHERE listing_id IS NOT NULL";
  if (kind === "general") where = "WHERE listing_id IS NULL";
  const { rows } = await pool.query(
    `SELECT ${CONTACT_COLS} FROM contacts
     ${where}
     ORDER BY created_at DESC`,
  );
  return rows;
}
