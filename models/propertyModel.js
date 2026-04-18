import pool from "../config/db.js"

// Columns returned by SELECT.
const COLUMNS = `
  id, title, description, price,
  address_line, building_name, landmark, sub_locality, locality,
  city, district, state, country, country_code, pincode,
  formatted_address, place_id,
  latitude, longitude,
  images, created_at
`

// Columns the client is allowed to write. id / created_at are omitted.
const WRITABLE = [
  "title", "description", "price",
  "address_line", "building_name", "landmark", "sub_locality", "locality",
  "city", "district", "state", "country", "country_code", "pincode",
  "formatted_address", "place_id",
  "latitude", "longitude",
  "images"
]

function pickWritable(data) {
  const out = []
  for (const col of WRITABLE) {
    if (data[col] !== undefined) out.push([col, data[col]])
  }
  return out
}

export async function listProperties({ city, lat, lng, radiusKm, limit = 20, offset = 0 }) {
  const where = []
  const params = []
  let i = 1

  if (city) {
    where.push(`city ILIKE $${i++}`)
    params.push(city)
  }

  let select = COLUMNS
  let orderBy = "created_at DESC"

  const hasRadius = lat != null && lng != null && radiusKm != null
  if (hasRadius) {
    const latIdx = i++
    const lngIdx = i++
    const radIdx = i++
    params.push(lat, lng, radiusKm)

    const haversine = `
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians($${latIdx})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($${lngIdx})) +
          sin(radians($${latIdx})) * sin(radians(latitude))
        ))
      )`

    select = `${COLUMNS}, (${haversine}) AS distance_km`

    // Bounding-box pre-filter so the btree index on (latitude, longitude) is usable.
    where.push(`latitude BETWEEN $${latIdx} - ($${radIdx} / 111.0) AND $${latIdx} + ($${radIdx} / 111.0)`)
    where.push(`longitude BETWEEN $${lngIdx} - ($${radIdx} / (111.0 * cos(radians($${latIdx})))) AND $${lngIdx} + ($${radIdx} / (111.0 * cos(radians($${latIdx}))))`)
    where.push(`(${haversine}) <= $${radIdx}`)

    orderBy = "distance_km ASC"
  }

  params.push(limit, offset)
  const sql = `
    SELECT ${select}
    FROM properties
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY ${orderBy}
    LIMIT $${i++} OFFSET $${i++}
  `
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function getPropertyById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM properties WHERE id = $1`, [id])
  return rows[0] || null
}

export async function createProperty(data) {
  const entries = pickWritable(data)
  if (entries.length === 0) {
    const err = new Error("No fields provided")
    err.status = 400
    throw err
  }

  const cols = entries.map(([c]) => c)
  const placeholders = entries.map((_, idx) => `$${idx + 1}`)
  const params = entries.map(([, v]) => v)

  const { rows } = await pool.query(
    `INSERT INTO properties (${cols.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${COLUMNS}`,
    params
  )
  return rows[0]
}

export async function updateProperty(id, patch) {
  const entries = pickWritable(patch)
  if (entries.length === 0) return getPropertyById(id)

  const setClauses = entries.map(([c], idx) => `${c} = $${idx + 1}`)
  const params = entries.map(([, v]) => v)
  params.push(id)

  const { rows } = await pool.query(
    `UPDATE properties SET ${setClauses.join(", ")}
     WHERE id = $${params.length}
     RETURNING ${COLUMNS}`,
    params
  )
  return rows[0] || null
}

export async function deleteProperty(id) {
  const { rowCount } = await pool.query(`DELETE FROM properties WHERE id = $1`, [id])
  return rowCount > 0
}
