import {
  createListing,
  getListingById,
  updateListing,
  setListingStatus,
  listListingsByOwner,
  listPublicListings,
  countPublicListings,
  deleteListing,
} from "../../db/listings/listingDb.js";
import {
  addListingImages,
  listListingImages,
  getListingImage,
  deleteListingImage,
} from "../../db/listings/listingImageDb.js";
import { resolveLocalityCentroid } from "../_shared/geocodeService.js";
import {
  deleteObject,
  deleteObjects,
  s3KeyFromUrl,
} from "../_shared/s3Service.js";
import { decoratePostedBy, decoratePostedByMany } from "../_shared/postedBy.js";
import { SEARCH_RADIUS_KM } from "../search/_searchConfig.js";
import { httpError } from "../../utils/httpError.js";
import { LISTING_STATUS, USER_ROLE } from "../../utils/constants.js";

const PUBLIC_LIST_RADIUS_KM = SEARCH_RADIUS_KM;
const DEFAULT_CITY_FOR_GEOCODE = "Bangalore";

async function assertOwnsListing(listingId, ownerId) {
  const listing = await getListingById(listingId);
  if (!listing) throw httpError(404, "Listing not found");
  if (listing.owner_id !== ownerId)
    throw httpError(403, "You do not own this listing");
  return listing;
}

export async function createListingForOwner(ownerId, data) {
  const created = await createListing({ ownerId, ...data });
  return decoratePostedBy(created);
}

export async function updateListingForOwner(ownerId, listingId, patch) {
  const listing = await assertOwnsListing(listingId, ownerId);
  if (listing.status === LISTING_STATUS.ACTIVE) {
    throw httpError(409, "Active listing cannot be edited; unpublish first");
  }
  const updated = await updateListing(listingId, patch);
  return decoratePostedBy(updated);
}

export async function submitListingForVerification(ownerId, listingId) {
  const listing = await assertOwnsListing(listingId, ownerId);
  if (
    listing.status !== LISTING_STATUS.DRAFT &&
    listing.status !== LISTING_STATUS.REJECTED
  ) {
    throw httpError(
      409,
      `Listing cannot be submitted from status '${listing.status}'`,
    );
  }
  const updated = await setListingStatus(listingId, {
    status: LISTING_STATUS.PENDING,
  });
  return decoratePostedBy(updated);
}

export async function addImagesToListing(ownerId, listingId, imageUrls) {
  await assertOwnsListing(listingId, ownerId);
  return addListingImages(listingId, imageUrls);
}

export async function listMyListings(ownerId) {
  const rows = await listListingsByOwner(ownerId);
  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) })),
  );
  return decoratePostedByMany(withImages);
}

// When a locality is supplied, resolve to a centroid via the Google-backed
// geocode cache and upgrade to a geo-radius filter ranked by distance.
// `total` reflects the filtered count, not just the current page.
export async function listPublic(filters) {
  const centroid = filters.locality
    ? await resolveLocalityCentroid(
        filters.city || DEFAULT_CITY_FOR_GEOCODE,
        filters.locality,
      )
    : null;

  const dbArgs = centroid
    ? { ...filters, centroid, radiusKm: PUBLIC_LIST_RADIUS_KM }
    : filters;

  const [rows, total] = await Promise.all([
    listPublicListings(dbArgs),
    countPublicListings(dbArgs),
  ]);

  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) })),
  );
  const decorated = await decoratePostedByMany(withImages);
  return { rows: decorated, total };
}

// Owners may touch only their own listings; admins may touch any. Status gate
// (active blocks owners; admins unrestricted) is layered on top.
async function assertCanDelete(requester, listingId) {
  const listing = await getListingById(listingId);
  if (!listing) throw httpError(404, "Listing not found");

  const isAdmin = requester.role === USER_ROLE.ADMIN;
  const isOwner = listing.owner_id === requester.id;
  if (!isAdmin && !isOwner) throw httpError(404, "Listing not found");

  if (!isAdmin && listing.status === LISTING_STATUS.ACTIVE) {
    throw httpError(403, "Active listing cannot be deleted; unpublish first");
  }
  return listing;
}

export async function removeListingImage(requester, listingId, imageId) {
  await assertCanDelete(requester, listingId);

  const image = await getListingImage(listingId, imageId);
  if (!image) throw httpError(404, "Image not found");

  const key = s3KeyFromUrl(image.image_url);
  if (key) await deleteObject(key);

  await deleteListingImage(listingId, imageId);
}

export async function removeListing(requester, listingId) {
  await assertCanDelete(requester, listingId);

  const images = await listListingImages(listingId);
  const keys = images.map((img) => s3KeyFromUrl(img.image_url)).filter(Boolean);

  await deleteListing(listingId);

  if (keys.length) {
    const { errors } = await deleteObjects(keys);
    if (errors.length) {
      console.error(
        `Orphaned S3 objects for deleted listing ${listingId}:`,
        errors,
      );
    }
  }
}

// Visibility: admin or owner-of-record sees any status; everyone else sees
// only active. Non-visible records return 404 so we don't leak existence.
export async function getListingForRequester(id, requester) {
  const listing = await getListingById(id);
  if (!listing) throw httpError(404, "Listing not found");

  const isAdmin = requester?.role === USER_ROLE.ADMIN;
  const isOwner = requester?.id != null && listing.owner_id === requester.id;
  const isActive = listing.status === LISTING_STATUS.ACTIVE;

  if (!isAdmin && !isOwner && !isActive) {
    throw httpError(404, "Listing not found");
  }

  listing.images = await listListingImages(listing.id);
  return decoratePostedBy(listing);
}
