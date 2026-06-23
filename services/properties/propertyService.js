import {
  createProperty,
  getPropertyById,
  updateProperty,
  setPropertyStatus,
  listPropertiesByOwner,
  countPropertiesByOwner,
  getOwnerStatusCounts,
  listPublicProperties,
  countPublicProperties,
  deleteProperty,
} from "../../db/properties/propertyDb.js";
import {
  addPropertyImages,
  listPropertyImages,
  getPropertyImage,
  deletePropertyImage,
} from "../../db/properties/propertyImageDb.js";
import { resolveLocalityCentroid } from "../_shared/geocodeService.js";
import {
  deleteObject,
  deleteObjects,
  s3KeyFromUrl,
} from "../_shared/s3Service.js";
import { decoratePostedBy, decoratePostedByMany } from "../_shared/postedBy.js";
import { applyCommunityTemplate } from "../_shared/communityTemplate.js";
import { SEARCH_RADIUS_KM } from "../search/_searchConfig.js";
import { httpError } from "../../utils/httpError.js";
import {
  DEFAULT_GEOCODE_CITY,
  LISTING_STATUS,
  USER_ROLE,
} from "../../utils/constants.js";

const PUBLIC_LIST_RADIUS_KM = SEARCH_RADIUS_KM;

async function assertOwnsProperty(propertyId, ownerId) {
  const property = await getPropertyById(propertyId);
  if (!property) throw httpError(404, "Property not found");
  if (property.owner_id !== ownerId)
    throw httpError(403, "You do not own this property");
  return property;
}

export async function createPropertyForOwner(
  ownerId,
  data,
  { actorRole } = {},
) {
  const resolved = await applyCommunityTemplate(data);
  const created = await createProperty({ ownerId, ...resolved });
  // Admin (OG Homes) posts go live immediately; owners start as drafts.
  if (actorRole === USER_ROLE.ADMIN) {
    const activated = await setPropertyStatus(created.id, {
      status: LISTING_STATUS.ACTIVE,
      approvedBy: ownerId,
    });
    return decoratePostedBy(activated);
  }
  return decoratePostedBy(created);
}

export async function updatePropertyForOwner(ownerId, propertyId, patch) {
  const property = await assertOwnsProperty(propertyId, ownerId);
  if (property.status === LISTING_STATUS.ACTIVE) {
    throw httpError(409, "Active property cannot be edited; unpublish first");
  }
  const updated = await updateProperty(propertyId, patch);
  return decoratePostedBy(updated);
}

export async function submitPropertyForVerification(ownerId, propertyId) {
  const property = await assertOwnsProperty(propertyId, ownerId);
  if (
    property.status !== LISTING_STATUS.DRAFT &&
    property.status !== LISTING_STATUS.REJECTED
  ) {
    throw httpError(
      409,
      `Property cannot be submitted from status '${property.status}'`,
    );
  }
  const updated = await setPropertyStatus(propertyId, {
    status: LISTING_STATUS.PENDING,
  });
  return decoratePostedBy(updated);
}

export async function addImagesToProperty(ownerId, propertyId, imageUrls) {
  await assertOwnsProperty(propertyId, ownerId);
  return addPropertyImages(propertyId, imageUrls);
}

// The caller's own properties. `count` reflects the status filter (drives the
// pager); `statusCounts` is the full per-status breakdown ignoring filter +
// pagination (drives tab badges / empty states). The three queries are
// independent, so run them concurrently.
export async function listMyProperties(
  ownerId,
  { status, limit, offset } = {},
) {
  const [rows, count, statusCounts] = await Promise.all([
    listPropertiesByOwner({ ownerId, status, limit, offset }),
    countPropertiesByOwner({ ownerId, status }),
    getOwnerStatusCounts(ownerId),
  ]);

  const withImages = await Promise.all(
    rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) })),
  );
  const data = await decoratePostedByMany(withImages);

  return { data, count, statusCounts };
}

// When a locality is supplied, resolve to a centroid via the Google-backed
// geocode cache and upgrade to a geo-radius filter ranked by distance.
// `total` reflects the filtered count, not just the current page.
export async function listPublic(filters) {
  const centroid = filters.locality
    ? await resolveLocalityCentroid(
        filters.city || DEFAULT_GEOCODE_CITY,
        filters.locality,
      )
    : null;

  const dbArgs = centroid
    ? { ...filters, centroid, radiusKm: PUBLIC_LIST_RADIUS_KM }
    : filters;

  const [rows, total] = await Promise.all([
    listPublicProperties(dbArgs),
    countPublicProperties(dbArgs),
  ]);

  const withImages = await Promise.all(
    rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) })),
  );
  const decorated = await decoratePostedByMany(withImages);
  return { rows: decorated, total };
}

// Owners may touch only their own properties; admins may touch any. Status gate
// (active blocks owners; admins unrestricted) is layered on top.
async function assertCanDelete(requester, propertyId) {
  const property = await getPropertyById(propertyId);
  if (!property) throw httpError(404, "Property not found");

  const isAdmin = requester.role === USER_ROLE.ADMIN;
  const isOwner = property.owner_id === requester.id;
  if (!isAdmin && !isOwner) throw httpError(404, "Property not found");

  if (!isAdmin && property.status === LISTING_STATUS.ACTIVE) {
    throw httpError(403, "Active property cannot be deleted; unpublish first");
  }
  return property;
}

export async function removePropertyImage(requester, propertyId, imageId) {
  await assertCanDelete(requester, propertyId);

  const image = await getPropertyImage(propertyId, imageId);
  if (!image) throw httpError(404, "Image not found");

  const key = s3KeyFromUrl(image.image_url);
  if (key) await deleteObject(key);

  await deletePropertyImage(propertyId, imageId);
}

export async function removeProperty(requester, propertyId) {
  await assertCanDelete(requester, propertyId);

  const images = await listPropertyImages(propertyId);
  const keys = images.map((img) => s3KeyFromUrl(img.image_url)).filter(Boolean);

  await deleteProperty(propertyId);

  if (keys.length) {
    const { errors } = await deleteObjects(keys);
    if (errors.length) {
      console.error(
        `Orphaned S3 objects for deleted property ${propertyId}:`,
        errors,
      );
    }
  }
}

// Visibility: admin or owner-of-record sees any status; everyone else sees
// only active. Non-visible records return 404 so we don't leak existence.
export async function getPropertyForRequester(id, requester) {
  const property = await getPropertyById(id);
  if (!property) throw httpError(404, "Property not found");

  const isAdmin = requester?.role === USER_ROLE.ADMIN;
  const isOwner = requester?.id != null && property.owner_id === requester.id;
  const isActive = property.status === LISTING_STATUS.ACTIVE;

  if (!isAdmin && !isOwner && !isActive) {
    throw httpError(404, "Property not found");
  }

  property.images = await listPropertyImages(property.id);
  return decoratePostedBy(property);
}
