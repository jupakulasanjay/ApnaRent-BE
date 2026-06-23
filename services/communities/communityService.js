import {
  createCommunity,
  getCommunityById,
  updateCommunity,
  listCommunities,
  countCommunities,
  deleteCommunity,
} from "../../db/communities/communityDb.js";
import {
  addCommunityImages,
  listCommunityImages,
  getCommunityImage,
  deleteCommunityImage,
} from "../../db/communities/communityImageDb.js";
import {
  setListingCommunity,
  listListingsByCommunity,
} from "../../db/listings/listingDb.js";
import { listListingImages } from "../../db/listings/listingImageDb.js";
import {
  setPropertyCommunity,
  listPropertiesByCommunity,
} from "../../db/properties/propertyDb.js";
import { listPropertyImages } from "../../db/properties/propertyImageDb.js";
import {
  deleteObject,
  deleteObjects,
  s3KeyFromUrl,
} from "../_shared/s3Service.js";
import { decoratePostedByMany } from "../_shared/postedBy.js";
import { httpError } from "../../utils/httpError.js";

async function assertCommunityExists(communityId) {
  const community = await getCommunityById(communityId);
  if (!community) throw httpError(404, "Community not found");
  return community;
}

export async function createCommunityAsAdmin(adminId, data) {
  return createCommunity({ createdBy: adminId, ...data });
}

export async function updateCommunityById(communityId, patch) {
  await assertCommunityExists(communityId);
  return updateCommunity(communityId, patch);
}

export async function addImagesToCommunity(communityId, imageUrls) {
  await assertCommunityExists(communityId);
  return addCommunityImages(communityId, imageUrls);
}

export async function removeCommunityImageById(communityId, imageId) {
  await assertCommunityExists(communityId);
  const image = await getCommunityImage(communityId, imageId);
  if (!image) throw httpError(404, "Image not found");

  const key = s3KeyFromUrl(image.image_url);
  if (key) await deleteObject(key);

  await deleteCommunityImage(communityId, imageId);
}

export async function removeCommunity(communityId) {
  await assertCommunityExists(communityId);

  const images = await listCommunityImages(communityId);
  const keys = images.map((img) => s3KeyFromUrl(img.image_url)).filter(Boolean);

  // FK on listings/properties is ON DELETE SET NULL, so members are detached
  // (not deleted); community_images cascade-delete.
  await deleteCommunity(communityId);

  if (keys.length) {
    const { errors } = await deleteObjects(keys);
    if (errors.length) {
      console.error(
        `Orphaned S3 objects for deleted community ${communityId}:`,
        errors,
      );
    }
  }
}

// Public list — newest first, each with its images. `total` reflects the full
// count, not just the current page.
export async function listPublicCommunities({ limit, offset } = {}) {
  const [rows, total] = await Promise.all([
    listCommunities({ limit, offset }),
    countCommunities(),
  ]);

  const data = await Promise.all(
    rows.map(async (c) => ({ ...c, images: await listCommunityImages(c.id) })),
  );
  return { data, total };
}

export async function getCommunityWithImages(communityId) {
  const community = await assertCommunityExists(communityId);
  community.images = await listCommunityImages(communityId);
  return community;
}

// Member rentals/properties of a community, each with their images and
// posted-by decoration. `activeOnly` (public path) hides non-active rows.
export async function listCommunityRentals(
  communityId,
  { activeOnly = false } = {},
) {
  await assertCommunityExists(communityId);
  const rows = await listListingsByCommunity({ communityId, activeOnly });
  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) })),
  );
  return decoratePostedByMany(withImages);
}

export async function listCommunityProperties(
  communityId,
  { activeOnly = false } = {},
) {
  await assertCommunityExists(communityId);
  const rows = await listPropertiesByCommunity({ communityId, activeOnly });
  const withImages = await Promise.all(
    rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) })),
  );
  return decoratePostedByMany(withImages);
}

// Admin link/unlink. Linking sets community_id only (the unit keeps its own
// location/amenities). Unknown unit ids are skipped silently.
export async function linkRentalsToCommunity(communityId, listingIds) {
  await assertCommunityExists(communityId);
  await Promise.all(
    listingIds.map((id) => setListingCommunity(id, communityId)),
  );
}

export async function unlinkRentalFromCommunity(communityId, listingId) {
  await assertCommunityExists(communityId);
  await setListingCommunity(listingId, null);
}

export async function linkPropertiesToCommunity(communityId, propertyIds) {
  await assertCommunityExists(communityId);
  await Promise.all(
    propertyIds.map((id) => setPropertyCommunity(id, communityId)),
  );
}

export async function unlinkPropertyFromCommunity(communityId, propertyId) {
  await assertCommunityExists(communityId);
  await setPropertyCommunity(propertyId, null);
}
