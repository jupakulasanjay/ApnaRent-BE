import {
  createProperty,
  getPropertyById,
  updateProperty,
  setPropertyStatus,
  listPropertiesByOwner,
  listPublicProperties,
  countPublicProperties,
  deleteProperty,
} from "../db/propertyDb.js";
import { resolveLocalityCentroid } from "./geocodeService.js";

const PUBLIC_LIST_RADIUS_KM = 15;
import {
  addPropertyImages,
  listPropertyImages,
  getPropertyImage,
  deletePropertyImage,
} from "../db/propertyImageDb.js";
import { deleteObject, deleteObjects, s3KeyFromUrl } from "./s3Service.js";
import { decoratePostedBy, decoratePostedByMany } from "./postedBy.js";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function assertOwnsProperty(propertyId, ownerId) {
  const property = await getPropertyById(propertyId);
  if (!property) throw httpError(404, "Property not found");
  if (property.owner_id !== ownerId)
    throw httpError(403, "You do not own this property");
  return property;
}

export async function createPropertyForUser(requester, data) {
  const created = await createProperty({ ownerId: requester.id, ...data });
  // Admin-created listings are trusted: skip the verification flow and go
  // straight to active, with the admin recorded as the approver.
  const finalRow =
    requester.role === "admin"
      ? await setPropertyStatus(created.id, {
          status: "active",
          approvedBy: requester.id,
          rejectionReason: null,
        })
      : created;
  return decoratePostedBy(finalRow);
}

export async function updatePropertyForUser(requester, propertyId, patch) {
  const property = await assertOwnsProperty(propertyId, requester.id);
  // Owners must unpublish before editing an active property; admins manage
  // their own ApnaRent inventory directly and can edit in place.
  if (property.status === "active" && requester.role !== "admin") {
    throw httpError(409, "Active property cannot be edited; unpublish first");
  }
  const updated = await updateProperty(propertyId, patch);
  return decoratePostedBy(updated);
}

export async function submitPropertyForVerification(requester, propertyId) {
  const property = await assertOwnsProperty(propertyId, requester.id);
  if (property.status !== "draft" && property.status !== "rejected") {
    throw httpError(
      409,
      `Property cannot be submitted from status '${property.status}'`,
    );
  }
  const updated = await setPropertyStatus(propertyId, {
    status: "pending_verification",
  });
  return decoratePostedBy(updated);
}

export async function addImagesToProperty(requester, propertyId, imageUrls) {
  await assertOwnsProperty(propertyId, requester.id);
  return addPropertyImages(propertyId, imageUrls);
}

export async function listMyProperties(requester) {
  const rows = await listPropertiesByOwner(requester.id);
  const withImages = await Promise.all(
    rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) })),
  );
  return decoratePostedByMany(withImages);
}

// See services/listingService.js → listPublic for the locality-centroid
// resolution and `total` semantics. Same pattern, properties table.
export async function listPublic(filters) {
  const centroid = filters.locality
    ? await resolveLocalityCentroid(
        filters.city || "Bangalore",
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

async function assertCanDelete(requester, propertyId) {
  const property = await getPropertyById(propertyId);
  if (!property) throw httpError(404, "Property not found");

  const isAdmin = requester.role === "admin";
  const isOwner = property.owner_id === requester.id;
  if (!isAdmin && !isOwner) throw httpError(404, "Property not found");

  if (!isAdmin && property.status === "active") {
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

// Role-aware detail fetch — see listingService.getListingForRequester for rules.
export async function getPropertyForRequester(id, requester) {
  const property = await getPropertyById(id);
  if (!property) throw httpError(404, "Property not found");

  const isAdmin = requester?.role === "admin";
  const isOwner = requester?.id != null && property.owner_id === requester.id;
  const isActive = property.status === "active";

  if (!isAdmin && !isOwner && !isActive) {
    throw httpError(404, "Property not found");
  }

  property.images = await listPropertyImages(property.id);
  return decoratePostedBy(property);
}
