import {
  createInterest,
  findInterestForUserListing,
  countInterestsByUser,
  listInterestsByUser,
  deleteInterestForUserListing,
} from "../../db/interests/interestDb.js";
import { getListingById } from "../../db/listings/listingDb.js";
import { listListingImages } from "../../db/listings/listingImageDb.js";
import { httpError } from "../../utils/httpError.js";
import {
  INTEREST_KIND,
  INTEREST_LIMIT_PER_USER,
  LISTING_STATUS,
  USER_ROLE,
} from "../../utils/constants.js";

// Mirrors listingService visibility:
//   admin → any status, owner of record → any status, otherwise → active only.
function canView(record, requester) {
  if (!record) return false;
  if (requester?.role === USER_ROLE.ADMIN) return true;
  if (requester?.id != null && record.owner_id === requester.id) return true;
  return record.status === LISTING_STATUS.ACTIVE;
}

async function loadVisibleListing(listingId, requester) {
  const listing = await getListingById(listingId);
  if (!canView(listing, requester)) return null;
  listing.images = await listListingImages(listing.id);
  return listing;
}

function shapeListingInterest(row, listing) {
  return {
    id: row.id,
    kind: INTEREST_KIND.LISTING,
    target_id: row.listing_id,
    created_at: row.created_at,
    listing,
  };
}

export async function listInterestsForUser(requester) {
  const rows = await listInterestsByUser(requester.id);
  const out = [];
  for (const row of rows) {
    const listing = await loadVisibleListing(row.listing_id, requester);
    if (listing) out.push(shapeListingInterest(row, listing));
  }
  return out;
}

export async function saveInterest(requester, { listingId }) {
  const listing = await loadVisibleListing(listingId, requester);
  if (!listing) throw httpError(404, "Listing not found");

  const existing = await findInterestForUserListing(requester.id, listingId);
  if (existing) {
    return {
      interest: shapeListingInterest(existing, listing),
      created: false,
    };
  }

  // Cap re-checked here (not in the validator) so existing-interest re-saves
  // stay idempotent even when the user is already at the limit.
  const count = await countInterestsByUser(requester.id);
  if (count >= INTEREST_LIMIT_PER_USER) {
    throw httpError(
      400,
      `Interest limit reached (${INTEREST_LIMIT_PER_USER}). Remove an existing interest before saving a new one.`,
    );
  }

  const row = await createInterest({ userId: requester.id, listingId });
  return { interest: shapeListingInterest(row, listing), created: true };
}

export async function removeInterest(requester, { targetId }) {
  const removed = await deleteInterestForUserListing(requester.id, targetId);
  if (!removed) throw httpError(404, "Interest not found");
}
