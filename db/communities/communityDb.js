import pool from "../../config/db.js";
import { COMMUNITY_DEFAULT_PAGE_LIMIT } from "../../services/communities/communityConstants.js";

const COMMUNITY_COLS = `
  id, name, description, community_type, towers, acres,
  address, locality, city, state, pincode, latitude, longitude,
  amenities, created_by, created_at
`;

const WRITABLE = [
  "name",
  "description",
  "community_type",
  "towers",
  "acres",
  "address",
  "locality",
  "city",
  "state",
  "pincode",
  "latitude",
  "longitude",
  "amenities",
];

function pickWritable(data) {
  const entries = [];
  for (const col of WRITABLE) {
    if (data[col] !== undefined) entries.push([col, data[col]]);
  }
  return entries;
}

export async function createCommunity({ createdBy, ...data }) {
  const entries = pickWritable(data);
  const cols = ["created_by", ...entries.map(([c]) => c)];
  const params = [createdBy, ...entries.map(([, v]) => v)];
  const placeholders = params.map((_, i) => `$${i + 1}`);

  const { rows } = await pool.query(
    `INSERT INTO communities (${cols.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${COMMUNITY_COLS}`,
    params,
  );
  return rows[0];
}

export async function getCommunityById(id) {
  const { rows } = await pool.query(
    `SELECT ${COMMUNITY_COLS} FROM communities WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function updateCommunity(id, patch) {
  const entries = pickWritable(patch);
  if (entries.length === 0) return getCommunityById(id);

  const setClauses = entries.map(([c], i) => `${c} = $${i + 1}`);
  const params = entries.map(([, v]) => v);
  params.push(id);

  const { rows } = await pool.query(
    `UPDATE communities SET ${setClauses.join(", ")}
     WHERE id = $${params.length}
     RETURNING ${COMMUNITY_COLS}`,
    params,
  );
  return rows[0] || null;
}

// All communities, newest first. A stable (created_at DESC, id DESC) sort keeps
// pages non-overlapping. `limit` omitted → no LIMIT clause (all rows).
export async function listCommunities({
  limit = COMMUNITY_DEFAULT_PAGE_LIMIT,
  offset = 0,
} = {}) {
  const params = [];
  let sql = `SELECT ${COMMUNITY_COLS} FROM communities
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

export async function countCommunities() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM communities`,
  );
  return rows[0].total;
}

export async function deleteCommunity(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM communities WHERE id = $1`,
    [id],
  );
  return rowCount > 0;
}
