// Single source of truth for the `posted_by` label that listings surface to
// the FE. The rule:
//
//   admin owner            → "ApnaRent"
//   non-admin owner w/ name → owner.name
//   non-admin owner, no name → "Owner"

import { findUsersByIds } from "../db/userDb.js";

const APNARENT_TAG = "ApnaRent";

export function resolvePostedBy(user) {
  if (!user) return "Owner";
  if (user.role === "admin") return APNARENT_TAG;
  return user.name || "Owner";
}

// Single batched user fetch → Map<owner_id, posted_by>.
export async function buildPostedByMap(ownerIds) {
  const ids = [...new Set(ownerIds.filter((id) => id != null))];
  if (ids.length === 0) return new Map();
  const users = await findUsersByIds(ids);
  const map = new Map();
  for (const u of users) map.set(u.id, resolvePostedBy(u));
  return map;
}

export async function decoratePostedBy(record) {
  if (!record) return record;
  const map = await buildPostedByMap([record.owner_id]);
  return { ...record, posted_by: map.get(record.owner_id) || "Owner" };
}

export async function decoratePostedByMany(records) {
  if (records.length === 0) return records;
  const map = await buildPostedByMap(records.map((r) => r.owner_id));
  return records.map((r) => ({
    ...r,
    posted_by: map.get(r.owner_id) || "Owner",
  }));
}
