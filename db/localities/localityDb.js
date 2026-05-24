import pool from "../../config/db.js";

export async function getLocalityCentroid(city, locality) {
  const { rows } = await pool.query(
    `SELECT latitude, longitude
     FROM localities
     WHERE lower(coalesce(city, '')) = lower(coalesce($1, ''))
       AND lower(locality) = lower($2)
     LIMIT 1`,
    [city || null, locality],
  );
  if (!rows[0]) return null;
  return {
    latitude: Number(rows[0].latitude),
    longitude: Number(rows[0].longitude),
  };
}

export async function upsertLocality({
  city,
  locality,
  latitude,
  longitude,
  source = "google",
}) {
  await pool.query(
    `INSERT INTO localities (city, locality, latitude, longitude, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lower(coalesce(city, '')), lower(locality))
       DO UPDATE SET latitude = EXCLUDED.latitude,
                     longitude = EXCLUDED.longitude,
                     source = EXCLUDED.source,
                     resolved_at = CURRENT_TIMESTAMP`,
    [city || null, locality, latitude, longitude, source],
  );
}
