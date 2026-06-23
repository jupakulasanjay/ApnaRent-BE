import pool from "../../config/db.js";
import { buildRankExpr } from "./_rank.js";
import { LISTING_STATUS } from "../../utils/constants.js";

const LISTING_COLS = `
  id, owner_id, title, description, rent,
  bhk, bathrooms, furnishing, available_from,
  address, locality, city, state, pincode, latitude, longitude,
  status, rejection_reason, approved_by, approved_at, amenities, community_id, created_at
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
  "community_id",
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
  minRent,
  maxRent,
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
  if (bhk != null) {
    where.push(`bhk = $${i++}`);
    params.push(bhk);
  }
  if (minRent != null) {
    where.push(`rent >= $${i++}`);
    params.push(minRent);
  }
  if (maxRent != null) {
    where.push(`rent <= $${i++}`);
    params.push(maxRent);
  }
  // ALL-of semantics for the explicit filter dropdown: a listing must include
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

export async function listPublicListings({
  city,
  locality,
  bhk,
  minRent,
  maxRent,
  amenities,
  centroid,
  radiusKm,
  limit = DEFAULT_PAGE_LIMIT,
  offset = 0,
}) {
  const { whereSql, params, nextIdx, distanceExpr } = buildPublicListingsWhere({
    city,
    locality,
    bhk,
    minRent,
    maxRent,
    amenities,
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
  minRent,
  maxRent,
  amenities,
  centroid,
  radiusKm,
}) {
  const { whereSql, params } = buildPublicListingsWhere({
    city,
    locality,
    bhk,
    minRent,
    maxRent,
    amenities,
    centroid,
    radiusKm,
  });
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM listings WHERE ${whereSql}`,
    params,
  );
  return rows[0].total;
}

// NL-search variant. Accepts multiple localities + a parallel `centroids`
// array; a listing matches if it's within radius of ANY resolved centroid,
// literally matches ANY locality with no resolved centroid, OR is a null-coord
// row literally matching ANY of the localities. Ranking distance is LEAST of
// the per-centroid distances.
//
// BHK is a soft ranking signal, not a hard WHERE — a user asking "2bhk in
// Neelasandra" still wants to see the only listing there even if it's a 1BHK.
export async function searchPublicListings({
  city,
  localities,
  bhk,
  minRent,
  maxRent,
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
  let softMatchExpr = null;
  if (bhk != null) {
    const bhkParam = `$${i++}`;
    params.push(bhk);
    softMatchExpr = `(CASE WHEN bhk = ${bhkParam} THEN 1.0
                           WHEN bhk IS NOT NULL AND abs(bhk - ${bhkParam}) = 1 THEN 0.5
                           ELSE 0.0 END)`;
  }
  if (minRent != null) {
    where.push(`rent >= $${i++}`);
    params.push(minRent);
  }
  if (maxRent != null) {
    where.push(`rent <= $${i++}`);
    params.push(maxRent);
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

// Attach/detach a listing to a community. `communityId` null detaches.
export async function setListingCommunity(id, communityId) {
  const { rows } = await pool.query(
    `UPDATE listings SET community_id = $2 WHERE id = $1 RETURNING ${LISTING_COLS}`,
    [id, communityId ?? null],
  );
  return rows[0] || null;
}

// Members of a community. `activeOnly` (public path) restricts to active rows;
// admins pass false to see every status.
export async function listListingsByCommunity({
  communityId,
  activeOnly = false,
}) {
  const params = [communityId];
  let where = `community_id = $1`;
  if (activeOnly) {
    where += ` AND status = '${LISTING_STATUS.ACTIVE}'`;
  }
  const { rows } = await pool.query(
    `SELECT ${LISTING_COLS} FROM listings
     WHERE ${where}
     ORDER BY created_at DESC, id DESC`,
    params,
  );
  return rows;
}
