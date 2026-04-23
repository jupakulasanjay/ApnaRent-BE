import pool from "../config/db.js"

const PROPERTY_COLS = `
  id, owner_id, title, description, price, property_type, area_sqft,
  address, locality, city,
  status, rejection_reason, approved_by, approved_at, created_at
`

const WRITABLE = [
  "title", "description", "price", "property_type", "area_sqft",
  "address", "locality", "city"
]

function pickWritable(data) {
  const entries = []
  for (const col of WRITABLE) {
    if (data[col] !== undefined) entries.push([col, data[col]])
  }
  return entries
}

export async function createProperty({ ownerId, ...data }) {
  const entries = pickWritable(data)
  const cols = ["owner_id", ...entries.map(([c]) => c)]
  const params = [ownerId, ...entries.map(([, v]) => v)]
  const placeholders = params.map((_, i) => `$${i + 1}`)

  const { rows } = await pool.query(
    `INSERT INTO properties (${cols.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${PROPERTY_COLS}`,
    params
  )
  return rows[0]
}

export async function getPropertyById(id) {
  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties WHERE id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function updateProperty(id, patch) {
  const entries = pickWritable(patch)
  if (entries.length === 0) return getPropertyById(id)

  const setClauses = entries.map(([c], i) => `${c} = $${i + 1}`)
  const params = entries.map(([, v]) => v)
  params.push(id)

  const { rows } = await pool.query(
    `UPDATE properties SET ${setClauses.join(", ")}
     WHERE id = $${params.length}
     RETURNING ${PROPERTY_COLS}`,
    params
  )
  return rows[0] || null
}

export async function setPropertyStatus(id, { status, approvedBy, rejectionReason }) {
  const { rows } = await pool.query(
    `UPDATE properties
     SET status = $2,
         approved_by = $3,
         approved_at = CASE WHEN $2 = 'active' THEN NOW() ELSE approved_at END,
         rejection_reason = $4
     WHERE id = $1
     RETURNING ${PROPERTY_COLS}`,
    [id, status, approvedBy || null, rejectionReason || null]
  )
  return rows[0] || null
}

export async function listPropertiesByOwner(ownerId) {
  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
     WHERE owner_id = $1
     ORDER BY created_at DESC`,
    [ownerId]
  )
  return rows
}

export async function listPropertiesByStatus({ status, limit = 50, offset = 0 }) {
  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
     WHERE status = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  )
  return rows
}

export async function listPublicProperties({
  city, locality, property_type, max_price, min_price,
  limit = 20, offset = 0
}) {
  const where = [`status = 'active'`]
  const params = []
  let i = 1

  if (city)          { where.push(`city ILIKE $${i++}`);     params.push(city) }
  if (locality)      { where.push(`locality ILIKE $${i++}`); params.push(locality) }
  if (property_type) { where.push(`property_type = $${i++}`); params.push(property_type) }
  if (max_price != null) { where.push(`price <= $${i++}`);   params.push(max_price) }
  if (min_price != null) { where.push(`price >= $${i++}`);   params.push(min_price) }

  params.push(limit, offset)

  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params
  )
  return rows
}

export async function getPublicPropertyById(id) {
  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
     WHERE id = $1 AND status = 'active'`,
    [id]
  )
  return rows[0] || null
}
