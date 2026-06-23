import { getCommunityById } from "../../db/communities/communityDb.js";
import { httpError } from "../../utils/httpError.js";

// Fields a community supplies as a template to its member units. Location +
// amenities only (per product decision; area is not inherited).
const INHERITED_FIELDS = [
  "address",
  "locality",
  "city",
  "state",
  "pincode",
  "latitude",
  "longitude",
  "amenities",
];

// If `data.community_id` is set, load the community and override the inherited
// fields from it (client-supplied values for those fields are ignored — the FE
// locks them, the BE enforces). Returns a new data object; passthrough when no
// community_id is present. Throws 404 if the community doesn't exist.
export async function applyCommunityTemplate(data) {
  if (data.community_id == null) return data;

  const community = await getCommunityById(data.community_id);
  if (!community) throw httpError(404, "Community not found");

  const inherited = {};
  for (const field of INHERITED_FIELDS) {
    inherited[field] = community[field];
  }
  return { ...data, ...inherited, community_id: community.id };
}
