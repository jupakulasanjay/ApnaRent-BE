import pool from "../../config/db.js";
import { buildRankExpr } from "./_rank.js";
import { LISTING_STATUS } from "../../utils/constants.js";

const LISTING_COLS = `
  id, owner_id, title, description, rent,
  bhk, bathrooms, furnishing, available_from,
  address, locality, city, state, pincode, latitude, longitude,
  status, rejection_reason, approved_by, approved_at, amenities, created_at
`;

const WRITABLE = [
  "title",
  "description",
  "rent",
  "bhk",
  "bathrooms",
  "furnishing",
  "available_from",
  "address",
  "locality",
  "city",
  "state",
  "pincode",
  "latitude",
  "longitude",
  "amenities",
];

const DEFAULT_PAGE_LIMIT = 20;
const DEFAULT_SEARCH_LIMIT = 50;
const KM_TO_METERS = 1000;

function pickWritable(data) {
  const entries = [];
  for (const col of WRITABLE) {
    if (data[col] !== undefined) entries.push([col, data[col]]);
  }
  return entries;
}

export async function createListing({ ownerId, ...data }) {
  const entries = pickWritable(data);
  const cols = ["owner_id", ...entries.map(([c]) => c)];
  const params = [ownerId, ...entries.map(([, v]) => v)];
  const placeholders = params.map((_, i) => `$${i + 1}`);

  const { rows } = await pool.query(
    `INSERT INTO listings (${cols.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${LISTING_COLS}`,
    params,
  );
  return rows[0];
}

export async function getListingById(id) {
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function updateListing(id, patch) {
  const entries = pickWritable(patch);
  if (entries.length === 0) return getListingById(id);

  const setClauses = entries.map(([c], i) => `${c} = $${i + 1}`);
  const params = entries.map(([, v]) => v);
  params.push(id);

  const { rows } = await pool.query(
    `UPDATE listings SET ${setClauses.join(", ")}
     WHERE id = $${params.length}
     RETURNING ${LISTING_COLS}`,
    params,
  );
  return rows[0] || null;
}

export async function setListingStatus(
  id,
  { status, approvedBy, rejectionReason },
) {
  const { rows } = await pool.query(
    `UPDATE listings
     SET status = $2,
         approved_by = $3,
         approved_at = CASE WHEN $2 = '${LISTING_STATUS.ACTIVE}' THEN NOW() ELSE approved_at END,
         rejection_reason = $4
     WHERE id = $1
     RETURNING ${LISTING_COLS}`,
    [id, status, approvedBy || null, rejectionReason || null],
  );
  return rows[0] || null;
}

// Owner's own rentals, optionally filtered by status and paginated. A stable
// (created_at DESC, id DESC) sort keeps pages non-overlapping. `limit` omitted
// → no LIMIT clause (all matching rows).
export async function listListingsByOwner({
  ownerId,
  status,
  limit,
  offset = 0,
}) {
  const params = [ownerId];
  let where = `owner_id = $1`;
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  let sql = `SELECT ${LISTING_COLS} FROM listings
     WHERE ${where}
     ORDER BY created_at DESC, id DESC`;

  if (limit != null) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  params.push(offset);
  sql += ` OFFSET $${params.length}`;

  const { rows } = await pool.query(sql, params);
  return rows;
}

// Total rows for the owner, honoring the (optional) status filter — drives the
// pager, so it ignores limit/offset.
export async function countListingsByOwner({ ownerId, status }) {
  const params = [ownerId];
  let where = `owner_id = $1`;
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM listings WHERE ${where}`,
    params,
  );
  return rows[0].total;
}

// Per-status breakdown across ALL the owner's rentals (no status filter, no
// pagination) in one grouped query. `all` is the sum of the four dashboard
// statuses; 'expired' rows, if any, are deliberately excluded from the buckets
// and from `all`.
export async function getOwnerStatusCounts(ownerId) {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
       FROM listings
      WHERE owner_id = $1
      GROUP BY status`,
    [ownerId],
  );

  const counts = {
    [LISTING_STATUS.DRAFT]: 0,
    [LISTING_STATUS.PENDING]: 0,
    [LISTING_STATUS.ACTIVE]: 0,
    [LISTING_STATUS.REJECTED]: 0,
  };
  for (const r of rows) {
    if (r.status in counts) counts[r.status] = r.count;
  }

  const all =
    counts[LISTING_STATUS.DRAFT] +
    counts[LISTING_STATUS.PENDING] +
    counts[LISTING_STATUS.ACTIVE] +
    counts[LISTING_STATUS.REJECTED];

  return { all, ...counts };
}

export async function listListingsByStatus({
  status,
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
}) {
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE status = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset],
  );
  return rows;
}

// Shared WHERE-builder for the public list + count queries. With a centroid +
// radiusKm, restricts to rows within radius (NULL-coord rows excluded — they
// can't be distance-ranked) and returns a distanceExpr for ORDER BY. Without
// a centroid, falls back to literal locality ILIKE.
function buildPublicListingsWhere({
  city,
  locality,
  bhk,
  maxRent,
  centroid,
  radiusKm,
}) {
  const where = [`status = '${LISTING_STATUS.ACTIVE}'`];
  const params = [];
  let i = 1;

  if (city) {
    where.push(`city ILIKE $${i++}`);
    params.push(city);
  }
  if (bhk != null) {
    where.push(`bhk = $${i++}`);
    params.push(bhk);
  }
  if (maxRent != null) {
    where.push(`rent <= $${i++}`);
    params.push(maxRent);
  }

  let distanceExpr = null;
  if (centroid && radiusKm) {
    const cLat = `$${i++}`;
    params.push(centroid.latitude);
    const cLng = `$${i++}`;
    params.push(centroid.longitude);
    const radM = `$${i++}`;
    params.push(radiusKm * KM_TO_METERS);
    where.push(`latitude IS NOT NULL AND longitude IS NOT NULL`);
    where.push(`earth_box(ll_to_earth(${cLat}::float8, ${cLng}::float8), ${radM}) @>
                ll_to_earth(latitude::float8, longitude::float8)`);
    where.push(`earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                               ll_to_earth(latitude::float8, longitude::float8)) <= ${radM}`);
    distanceExpr = `earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                                   ll_to_earth(latitude::float8, longitude::float8))`;
  } else if (locality) {
    // Wrap with %s so canonical names match looser DB values
    // ("Mahadevapura, Bangalore", "Old Mahadevapura").
    where.push(`locality ILIKE $${i++}`);
    params.push(`%${locality}%`);
  }

  return { whereSql: where.join(" AND "), params, nextIdx: i, distanceExpr };
}

export async function listPublicListings({
  city,
  locality,
  bhk,
  maxRent,
  centroid,
  radiusKm,
  limit = DEFAULT_PAGE_LIMIT,
  offset = 0,
}) {
  const { whereSql, params, nextIdx, distanceExpr } = buildPublicListingsWhere({
    city,
    locality,
    bhk,
    maxRent,
    centroid,
    radiusKm,
  });
  let i = nextIdx;
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE ${whereSql}
     ORDER BY ${buildRankExpr({ distanceExpr })} DESC, created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params,
  );
  return rows;
}

export async function countPublicListings({
  city,
  locality,
  bhk,
  maxRent,
  centroid,
  radiusKm,
}) {
  const { whereSql, params } = buildPublicListingsWhere({
    city,
    locality,
    bhk,
    maxRent,
    centroid,
    radiusKm,
  });
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM listings WHERE ${whereSql}`,
    params,
  );
  return rows[0].total;
}

// NL-search variant. With a centroid, matches rows within radiusKm OR rows
// with NULL coords matching the literal locality (ungeocoded older entries).
// BHK is a soft ranking signal, not a hard WHERE — a user asking "2bhk in
// Neelasandra" still wants to see the only listing there even if it's a 1BHK.
export async function searchPublicListings({
  city,
  locality,
  bhk,
  maxRent,
  centroid,
  radiusKm,
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
}) {
  const where = [`status = '${LISTING_STATUS.ACTIVE}'`];
  const params = [];
  let i = 1;

  if (city) {
    where.push(`city ILIKE $${i++}`);
    params.push(city);
  }
  let softMatchExpr = null;
  if (bhk != null) {
    const bhkParam = `$${i++}`;
    params.push(bhk);
    softMatchExpr = `(CASE WHEN bhk = ${bhkParam} THEN 1.0
                           WHEN bhk IS NOT NULL AND abs(bhk - ${bhkParam}) = 1 THEN 0.5
                           ELSE 0.0 END)`;
  }
  if (maxRent != null) {
    where.push(`rent <= $${i++}`);
    params.push(maxRent);
  }

  let distanceExpr = null;
  if (centroid && radiusKm) {
    // earth_box() lets the GiST index prune; earth_distance() is exact.
    const cLat = `$${i++}`;
    params.push(centroid.latitude);
    const cLng = `$${i++}`;
    params.push(centroid.longitude);
    const radM = `$${i++}`;
    params.push(radiusKm * KM_TO_METERS);
    const litLoc = locality ? `$${i++}` : null;
    if (litLoc) params.push(`%${locality}%`);

    const radiusClause = `
      latitude IS NOT NULL AND longitude IS NOT NULL
      AND earth_box(ll_to_earth(${cLat}::float8, ${cLng}::float8), ${radM}) @>
          ll_to_earth(latitude::float8, longitude::float8)
      AND earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                         ll_to_earth(latitude::float8, longitude::float8)) <= ${radM}
    `;
    const nullCoordFallback = litLoc
      ? `(latitude IS NULL AND locality ILIKE ${litLoc})`
      : `false`;

    where.push(`((${radiusClause}) OR ${nullCoordFallback})`);
    distanceExpr = `earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                                   ll_to_earth(latitude::float8, longitude::float8))`;
  } else if (locality) {
    where.push(`locality ILIKE $${i++}`);
    params.push(`%${locality}%`);
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE ${where.join(" AND ")}
     ORDER BY ${buildRankExpr({ distanceExpr, softMatchExpr })} DESC, created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params,
  );
  return rows;
}

export async function getPublicListingById(id) {
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE id = $1 AND status = '${LISTING_STATUS.ACTIVE}'`,
    [id],
  );
  return rows[0] || null;
}

export async function deleteListing(id) {
  const { rowCount } = await pool.query(`DELETE FROM listings WHERE id = $1`, [
    id,
  ]);
  return rowCount > 0;
}
