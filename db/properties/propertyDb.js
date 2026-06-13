import pool from "../../config/db.js";
import { buildRankExpr } from "../listings/_rank.js";
import { LISTING_STATUS } from "../../utils/constants.js";

const PROPERTY_COLS = `
  id, owner_id, title, description, price, property_type, area, property_facing,
  bathrooms, furnishing, available_from,
  address, locality, city, state, pincode, latitude, longitude,
  status, rejection_reason, approved_by, approved_at, amenities, created_at
`;

const WRITABLE = [
  "title",
  "description",
  "price",
  "property_type",
  "area",
  "property_facing",
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

export async function createProperty({ ownerId, ...data }) {
  const entries = pickWritable(data);
  const cols = ["owner_id", ...entries.map(([c]) => c)];
  const params = [ownerId, ...entries.map(([, v]) => v)];
  const placeholders = params.map((_, i) => `$${i + 1}`);

  const { rows } = await pool.query(
    `INSERT INTO properties (${cols.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${PROPERTY_COLS}`,
    params,
  );
  return rows[0];
}

export async function getPropertyById(id) {
  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function updateProperty(id, patch) {
  const entries = pickWritable(patch);
  if (entries.length === 0) return getPropertyById(id);

  const setClauses = entries.map(([c], i) => `${c} = $${i + 1}`);
  const params = entries.map(([, v]) => v);
  params.push(id);

  const { rows } = await pool.query(
    `UPDATE properties SET ${setClauses.join(", ")}
     WHERE id = $${params.length}
     RETURNING ${PROPERTY_COLS}`,
    params,
  );
  return rows[0] || null;
}

export async function setPropertyStatus(
  id,
  { status, approvedBy, rejectionReason },
) {
  const { rows } = await pool.query(
    `UPDATE properties
     SET status = $2,
         approved_by = $3,
         approved_at = CASE WHEN $2 = '${LISTING_STATUS.ACTIVE}' THEN NOW() ELSE approved_at END,
         rejection_reason = $4
     WHERE id = $1
     RETURNING ${PROPERTY_COLS}`,
    [id, status, approvedBy || null, rejectionReason || null],
  );
  return rows[0] || null;
}

// Owner's own properties, optionally filtered by status and paginated. A stable
// (created_at DESC, id DESC) sort keeps pages non-overlapping. `limit` omitted
// → no LIMIT clause (all matching rows).
export async function listPropertiesByOwner({
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

  let sql = `SELECT ${PROPERTY_COLS} FROM properties
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
export async function countPropertiesByOwner({ ownerId, status }) {
  const params = [ownerId];
  let where = `owner_id = $1`;
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM properties WHERE ${where}`,
    params,
  );
  return rows[0].total;
}

// Per-status breakdown across ALL the owner's properties (no status filter, no
// pagination) in one grouped query. `all` is the sum of the four dashboard
// statuses; 'expired' rows, if any, are deliberately excluded from the buckets
// and from `all`.
export async function getOwnerStatusCounts(ownerId) {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
       FROM properties
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

export async function listPropertiesByStatus({
  status,
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
}) {
  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
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
function buildPublicPropertiesWhere({
  city,
  locality,
  propertyType,
  propertyFacing,
  minPrice,
  maxPrice,
  maxArea,
  amenities,
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
  if (propertyType) {
    where.push(`property_type = $${i++}`);
    params.push(propertyType);
  }
  if (propertyFacing) {
    where.push(`property_facing = $${i++}`);
    params.push(propertyFacing);
  }
  if (minPrice != null) {
    where.push(`price >= $${i++}`);
    params.push(minPrice);
  }
  if (maxPrice != null) {
    where.push(`price <= $${i++}`);
    params.push(maxPrice);
  }
  if (maxArea != null) {
    where.push(`area <= $${i++}`);
    params.push(maxArea);
  }
  // ALL-of semantics for the explicit filter dropdown: a property must include
  // every picked amenity. NL search uses ANY-of via a separate code path.
  if (Array.isArray(amenities) && amenities.length > 0) {
    where.push(`amenities @> $${i++}::text[]`);
    params.push(amenities);
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

export async function listPublicProperties({
  city,
  locality,
  propertyType,
  propertyFacing,
  minPrice,
  maxPrice,
  maxArea,
  amenities,
  centroid,
  radiusKm,
  limit = DEFAULT_PAGE_LIMIT,
  offset = 0,
}) {
  const { whereSql, params, nextIdx, distanceExpr } =
    buildPublicPropertiesWhere({
      city,
      locality,
      propertyType,
      propertyFacing,
      minPrice,
      maxPrice,
      maxArea,
      amenities,
      centroid,
      radiusKm,
    });
  let i = nextIdx;
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
     WHERE ${whereSql}
     ORDER BY ${buildRankExpr({ distanceExpr })} DESC, created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params,
  );
  return rows;
}

export async function countPublicProperties({
  city,
  locality,
  propertyType,
  propertyFacing,
  minPrice,
  maxPrice,
  maxArea,
  amenities,
  centroid,
  radiusKm,
}) {
  const { whereSql, params } = buildPublicPropertiesWhere({
    city,
    locality,
    propertyType,
    propertyFacing,
    minPrice,
    maxPrice,
    maxArea,
    amenities,
    centroid,
    radiusKm,
  });
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM properties WHERE ${whereSql}`,
    params,
  );
  return rows[0].total;
}

// NL-search variant. Accepts multiple localities + a parallel `centroids`
// array; a property matches if it's within radius of ANY resolved centroid,
// literally matches ANY locality with no resolved centroid, OR is a null-coord
// row literally matching ANY of the localities. Ranking distance is LEAST of
// the per-centroid distances.
//
// property_type, unlike the rentals' soft BHK signal, is a HARD WHERE filter.
// `propertyTypes` is an array (multi-select): a row matches if its type is ANY
// of the listed types (OR). Empty/omitted → no type constraint (all types).
export async function searchPublicProperties({
  city,
  localities,
  propertyTypes,
  propertyFacings,
  minPrice,
  maxPrice,
  minArea,
  maxArea,
  amenities,
  amenitiesMode = "any",
  centroids,
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
  if (Array.isArray(propertyTypes) && propertyTypes.length > 0) {
    where.push(`property_type = ANY($${i++}::text[])`);
    params.push(propertyTypes);
  }
  if (Array.isArray(propertyFacings) && propertyFacings.length > 0) {
    where.push(`property_facing = ANY($${i++}::text[])`);
    params.push(propertyFacings);
  }
  if (minPrice != null) {
    where.push(`price >= $${i++}`);
    params.push(minPrice);
  }
  if (maxPrice != null) {
    where.push(`price <= $${i++}`);
    params.push(maxPrice);
  }
  if (minArea != null) {
    where.push(`area >= $${i++}`);
    params.push(minArea);
  }
  if (maxArea != null) {
    where.push(`area <= $${i++}`);
    params.push(maxArea);
  }
  // `any` = array overlap (&&), `all` = array contains (@>). NL search passes
  // `any` so "gym OR pool" is reasonable recall; the manual filter passes
  // `all` so each picked chip is a hard constraint.
  if (Array.isArray(amenities) && amenities.length > 0) {
    const op = amenitiesMode === "all" ? "@>" : "&&";
    where.push(`amenities ${op} $${i++}::text[]`);
    params.push(amenities);
  }

  let distanceExpr = null;
  const locs = Array.isArray(localities) ? localities.filter(Boolean) : [];
  const cents = Array.isArray(centroids) ? centroids : [];
  if (locs.length > 0) {
    const resolved = locs
      .map((loc, idx) => ({ loc, c: cents[idx] || null }))
      .filter((x) => x.c);
    const unresolved = locs.filter((_, idx) => !cents[idx]);

    let radMParam = null;
    if (resolved.length > 0 && radiusKm) {
      radMParam = `$${i++}`;
      params.push(radiusKm * KM_TO_METERS);
    }

    const radiusOrParts = [];
    const distanceParts = [];
    for (const { c } of resolved) {
      if (!radMParam) break;
      const cLat = `$${i++}`;
      params.push(c.latitude);
      const cLng = `$${i++}`;
      params.push(c.longitude);
      radiusOrParts.push(
        `(earth_box(ll_to_earth(${cLat}::float8, ${cLng}::float8), ${radMParam}) @>
            ll_to_earth(latitude::float8, longitude::float8)
          AND earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                             ll_to_earth(latitude::float8, longitude::float8)) <= ${radMParam})`,
      );
      distanceParts.push(
        `earth_distance(ll_to_earth(${cLat}::float8, ${cLng}::float8),
                        ll_to_earth(latitude::float8, longitude::float8))`,
      );
    }

    // Literal ILIKE patterns: for null-coord fallback across ALL localities
    // and for the no-centroid case for unresolved ones. We re-use one set of
    // params for both branches to keep the query compact.
    const litParams = locs.map(() => `$${i++}`);
    for (const l of locs) params.push(`%${l}%`);
    const anyLiteralMatch = `(${litParams
      .map((p) => `locality ILIKE ${p}`)
      .join(" OR ")})`;

    const branches = [];
    if (radiusOrParts.length > 0) {
      branches.push(
        `(latitude IS NOT NULL AND longitude IS NOT NULL AND (${radiusOrParts.join(" OR ")}))`,
      );
      // Null-coord rows that match any literal locality (legacy ungeocoded
      // entries).
      branches.push(`(latitude IS NULL AND ${anyLiteralMatch})`);
      // For unresolved localities, fall back to literal-only with no spatial
      // bound (any row matching them, regardless of coords).
      if (unresolved.length > 0) {
        const unresolvedParams = unresolved.map(() => `$${i++}`);
        for (const l of unresolved) params.push(`%${l}%`);
        branches.push(
          `(${unresolvedParams.map((p) => `locality ILIKE ${p}`).join(" OR ")})`,
        );
      }
    } else {
      // No centroids at all — every locality fall back to literal ILIKE.
      branches.push(anyLiteralMatch);
    }

    where.push(`(${branches.join(" OR ")})`);

    if (distanceParts.length > 0) {
      distanceExpr =
        distanceParts.length === 1
          ? distanceParts[0]
          : `LEAST(${distanceParts.join(", ")})`;
    }
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
     WHERE ${where.join(" AND ")}
     ORDER BY ${buildRankExpr({ distanceExpr })} DESC, created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params,
  );
  return rows;
}

export async function getPublicPropertyById(id) {
  const { rows } = await pool.query(
    `SELECT ${PROPERTY_COLS} FROM properties
     WHERE id = $1 AND status = '${LISTING_STATUS.ACTIVE}'`,
    [id],
  );
  return rows[0] || null;
}

export async function deleteProperty(id) {
  const { rowCount } = await pool.query(`DELETE FROM properties WHERE id = $1`, [
    id,
  ]);
  return rowCount > 0;
}
