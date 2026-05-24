// posted_by labels surfaced on every listing:
//   admin owner             → "ApnaRent"
//   non-admin owner w/ name → owner.name
//   anything else           → "Owner"

import { findUsersByIds } from "../../db/users/userDb.js";
import { APNARENT_TAG, USER_ROLE } from "../../utils/constants.js";

export function resolvePostedBy(user) {
  if (!user) return "Owner";
  if (user.role === USER_ROLE.ADMIN) return APNARENT_TAG;
  return user.name || "Owner";
}

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
