import pool from "../config/db.js"

const LISTING_COLS = `
  id, owner_id, title, description, rent,
  bhk, bathrooms, furnishing, available_from,
  address, locality, city, state, pincode, latitude, longitude,
  status, rejection_reason, approved_by, approved_at, amenities, created_at
`

const WRITABLE = [
  "title", "description", "rent",
  "bhk", "bathrooms", "furnishing", "available_from",
  "address", "locality", "city", "state", "pincode", "latitude", "longitude",
  "amenities"
]

function pickWritable(data) {
  const entries = []
  for (const col of WRITABLE) {
    if (data[col] !== undefined) entries.push([col, data[col]])
  }
  return entries
}

export async function createListing({ ownerId, ...data }) {
  const entries = pickWritable(data)
  const cols = ["owner_id", ...entries.map(([c]) => c)]
  const params = [ownerId, ...entries.map(([, v]) => v)]
  const placeholders = params.map((_, i) => `$${i + 1}`)

  const { rows } = await pool.query(
    `INSERT INTO listings (${cols.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${LISTING_COLS}`,
    params
  )
  return rows[0]
}

export async function getListingById(id) {
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings WHERE id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function updateListing(id, patch) {
  const entries = pickWritable(patch)
  if (entries.length === 0) return getListingById(id)

  const setClauses = entries.map(([c], i) => `${c} = $${i + 1}`)
  const params = entries.map(([, v]) => v)
  params.push(id)

  const { rows } = await pool.query(
    `UPDATE listings SET ${setClauses.join(", ")}
     WHERE id = $${params.length}
     RETURNING ${LISTING_COLS}`,
    params
  )
  return rows[0] || null
}

export async function setListingStatus(id, { status, approvedBy, rejectionReason }) {
  const { rows } = await pool.query(
    `UPDATE listings
     SET status = $2,
         approved_by = $3,
         approved_at = CASE WHEN $2 = 'active' THEN NOW() ELSE approved_at END,
         rejection_reason = $4
     WHERE id = $1
     RETURNING ${LISTING_COLS}`,
    [id, status, approvedBy || null, rejectionReason || null]
  )
  return rows[0] || null
}

export async function listListingsByOwner(ownerId) {
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE owner_id = $1
     ORDER BY created_at DESC`,
    [ownerId]
  )
  return rows
}

export async function listListingsByStatus({ status, limit = 50, offset = 0 }) {
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE status = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  )
  return rows
}

export async function listPublicListings({ city, locality, bhk, maxRent, limit = 20, offset = 0 }) {
  const where = [`status = 'active'`]
  const params = []
  let i = 1

  if (city)     { where.push(`city ILIKE $${i++}`);     params.push(city) }
  if (locality) { where.push(`locality ILIKE $${i++}`); params.push(locality) }
  if (bhk != null)     { where.push(`bhk = $${i++}`);  params.push(bhk) }
  if (maxRent != null) { where.push(`rent <= $${i++}`); params.push(maxRent) }

  params.push(limit, offset)

  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params
  )
  return rows
}

export async function getPublicListingById(id) {
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE id = $1 AND status = 'active'`,
    [id]
  )
  return rows[0] || null
}
