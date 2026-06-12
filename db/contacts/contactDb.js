import pool from "../../config/db.js";
import { CONTACT_KIND } from "../../utils/constants.js";

const CONTACT_COLS = `id, user_id, listing_id, property_id, subject, message, created_at`;

export async function createContact({
  userId,
  listingId = null,
  propertyId = null,
  subject = null,
  message,
}) {
  const { rows } = await pool.query(
    `INSERT INTO contacts (user_id, listing_id, property_id, subject, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${CONTACT_COLS}`,
    [userId, listingId, propertyId, subject, message],
  );
  return rows[0];
}

export async function listAllContacts({ kind } = {}) {
  let where = "";
  if (kind === CONTACT_KIND.LISTING) where = "WHERE listing_id IS NOT NULL";
  if (kind === CONTACT_KIND.PROPERTY) where = "WHERE property_id IS NOT NULL";
  if (kind === CONTACT_KIND.GENERAL)
    where = "WHERE listing_id IS NULL AND property_id IS NULL";
  const { rows } = await pool.query(
    `SELECT ${CONTACT_COLS} FROM contacts
     ${where}
     ORDER BY created_at DESC`,
  );
  return rows;
}
