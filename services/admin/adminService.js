import {
  getListingById,
  setListingStatus,
  listListingsByStatus,
} from "../../db/listings/listingDb.js";
import { listListingImages } from "../../db/listings/listingImageDb.js";
import { decoratePostedBy, decoratePostedByMany } from "../_shared/postedBy.js";
import { httpError } from "../../utils/httpError.js";
import { LISTING_STATUS } from "../../utils/constants.js";

const PENDING_LIST_LIMIT = 100;

export async function listPendingListings() {
  const rows = await listListingsByStatus({
    status: LISTING_STATUS.PENDING,
    limit: PENDING_LIST_LIMIT,
  });
  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) })),
  );
  return decoratePostedByMany(withImages);
}

export async function approveListing(listingId, adminId) {
  const listing = await getListingById(listingId);
  if (!listing) throw httpError(404, "Listing not found");
  if (listing.status !== LISTING_STATUS.PENDING) {
    throw httpError(
      409,
      `Only pending_verification listings can be approved (got '${listing.status}')`,
    );
  }
  const updated = await setListingStatus(listingId, {
    status: LISTING_STATUS.ACTIVE,
    approvedBy: adminId,
    rejectionReason: null,
  });
  return decoratePostedBy(updated);
}

export async function rejectListing(listingId, adminId, reason) {
  const listing = await getListingById(listingId);
  if (!listing) throw httpError(404, "Listing not found");
  if (listing.status !== LISTING_STATUS.PENDING) {
    throw httpError(
      409,
      `Only pending_verification listings can be rejected (got '${listing.status}')`,
    );
  }
  const updated = await setListingStatus(listingId, {
    status: LISTING_STATUS.REJECTED,
    approvedBy: adminId,
    rejectionReason: reason,
  });
  return decoratePostedBy(updated);
}
