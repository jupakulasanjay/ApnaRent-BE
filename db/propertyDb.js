import pool from "../config/db.js"

const PROPERTY_COLS = `
  id, owner_id, title, description, price, property_type, area_sqft,
  address, locality, city, state, pincode, latitude, longitude,
  status, rejection_reason, approved_by, approved_at, amenities, created_at
`

const WRITABLE = [
  "title", "description", "price", "property_type", "area_sqft",
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

// See db/listingDb.js → buildPublicListingsWhere for the same shape.
function buildPublicPropertiesWhere({
  city, locality, property_type, max_price, min_price, centroid, radiusKm
}) {
  const where = [`status = 'active'`]
  const params = []
  let i = 1

  if (city)              { where.push(`city ILIKE $${i++}`);      params.push(city) }
  if (property_type)     { where.push(`property_type = $${i++}`); params.push(property_type) }
  if (max_price != null) { where.push(`price <= $${i++}`);        params.push(max_price) }
  if (min_price != null) { where.push(`price >= $${i++}`);        params.push(min_price) }

  let distanceExpr = null
  if (centroid && radiusKm) {
    const cLat = `$${i++}`; params.push(centroid.latitude)
    const cLng = `$${i++}`; params.push(centroid.longitude)
    const radM = `$${i++}`; params.push(radiusKm * 1000)
    where.push(`latitude IS NOT NULL AND longitude IS NOT NULL`)
    where.push(`earth_box(ll_to_earth(${cLat}::float8, ${cLng}::float8), ${radM}) @>
                ll_to_earth(latitude::float8, longitude::float8)`)
    where.push(`earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                               ll_to_earth(latitude::float8, longitude::float8)) <= ${radM}`)
    distanceExpr = `earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                                   ll_to_earth(latitude::float8, longitude::float8))`
  } else if (locality) {
    where.push(`locality ILIKE $${i++}`); params.push(locality)
  }

  return { whereSql: where.join(" AND "), params, nextIdx: i, distanceExpr }
}

export async function listPublicProperties({
  city, locality, property_type, max_price, min_price,
  centroid, radiusKm,
  limit = 20, offset = 0
}) {
  const { whereSql, params, nextIdx, distanceExpr } = buildPublicPropertiesWhere({
    city, locality, property_type, max_price, min_price, centroid, radiusKm
  })
  let i = nextIdx
  params.push(limit, offset)

  const orderBy = distanceExpr
    ? `${distanceExpr} ASC, created_at DESC`
    : `created_at DESC`

  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${i++} OFFSET $${i++}`,
    params
  )
  return rows
}

export async function countPublicProperties({
  city, locality, property_type, max_price, min_price, centroid, radiusKm
}) {
  const { whereSql, params } = buildPublicPropertiesWhere({
    city, locality, property_type, max_price, min_price, centroid, radiusKm
  })
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM properties WHERE ${whereSql}`,
    params
  )
  return rows[0].total
}

export async function searchPublicProperties({
  city, locality, property_type, min_price, max_price,
  centroid, radiusKm,
  limit = 50, offset = 0
}) {
  const where = [`status = 'active'`]
  const params = []
  let i = 1

  if (city)              { where.push(`city ILIKE $${i++}`);     params.push(city) }
  if (property_type)     { where.push(`property_type = $${i++}`); params.push(property_type) }
  if (max_price != null) { where.push(`price <= $${i++}`);       params.push(max_price) }
  if (min_price != null) { where.push(`price >= $${i++}`);       params.push(min_price) }

  if (centroid && radiusKm) {
    const cLat = `$${i++}`; params.push(centroid.latitude)
    const cLng = `$${i++}`; params.push(centroid.longitude)
    const radM = `$${i++}`; params.push(radiusKm * 1000)
    const litLoc = locality ? `$${i++}` : null
    if (litLoc) params.push(locality)

    const radiusClause = `
      latitude IS NOT NULL AND longitude IS NOT NULL
      AND earth_box(ll_to_earth(${cLat}::float8, ${cLng}::float8), ${radM}) @>
          ll_to_earth(latitude::float8, longitude::float8)
      AND earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                         ll_to_earth(latitude::float8, longitude::float8)) <= ${radM}
    `
    const nullCoordFallback = litLoc
      ? `(latitude IS NULL AND locality ILIKE ${litLoc})`
      : `false`

    where.push(`((${radiusClause}) OR ${nullCoordFallback})`)
  } else if (locality) {
    where.push(`locality ILIKE $${i++}`); params.push(locality)
  }

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

export async function deleteProperty(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM properties WHERE id = $1`,
    [id]
  )
  return rowCount > 0
}
