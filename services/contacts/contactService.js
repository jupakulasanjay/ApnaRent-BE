import { createContact, listAllContacts } from "../../db/contacts/contactDb.js";
import {
  getPublicListingById,
  getListingById,
} from "../../db/listings/listingDb.js";
import { listListingImages } from "../../db/listings/listingImageDb.js";
import {
  getPublicPropertyById,
  getPropertyById,
} from "../../db/properties/propertyDb.js";
import { listPropertyImages } from "../../db/properties/propertyImageDb.js";
import { findUsersByIds } from "../../db/users/userDb.js";
import { httpError } from "../../utils/httpError.js";
import {
  CONTACT_KIND,
  LISTING_STATUS,
  USER_ROLE,
} from "../../utils/constants.js";

export async function submitContact({
  userId,
  listingId,
  propertyId,
  message,
}) {
  if (listingId) {
    const listing = await getPublicListingById(listingId);
    if (!listing) throw httpError(404, "Listing not found or not active");
    return createContact({ userId, listingId, message });
  }
  if (propertyId) {
    const property = await getPublicPropertyById(propertyId);
    if (!property) throw httpError(404, "Property not found or not active");
    return createContact({ userId, propertyId, message });
  }
  // Validator enforces XOR upstream; this is defensive.
  throw httpError(400, "Provide exactly one of listing_id or property_id");
}

export async function submitGeneralContact({ userId, subject, message }) {
  return createContact({ userId, subject, message });
}

function canViewTarget(record, requester) {
  if (!record) return false;
  if (requester?.role === USER_ROLE.ADMIN) return true;
  if (requester?.id != null && record.owner_id === requester.id) return true;
  return record.status === LISTING_STATUS.ACTIVE;
}

async function loadListingSnapshot(listingId, requester) {
  const listing = await getListingById(listingId);
  if (!canViewTarget(listing, requester)) return null;
  listing.images = await listListingImages(listing.id);
  return listing;
}

async function loadPropertySnapshot(propertyId, requester) {
  const property = await getPropertyById(propertyId);
  if (!canViewTarget(property, requester)) return null;
  property.images = await listPropertyImages(property.id);
  return property;
}

function inferKind(row) {
  if (row.listing_id != null) return CONTACT_KIND.LISTING;
  if (row.property_id != null) return CONTACT_KIND.PROPERTY;
  return CONTACT_KIND.GENERAL;
}

function shape(row, { listing = null, property = null } = {}) {
  return {
    id: row.id,
    kind: inferKind(row),
    target_id: row.listing_id ?? row.property_id ?? null,
    subject: row.subject ?? null,
    message: row.message,
    created_at: row.created_at,
    listing,
    property,
  };
}

function pickOwner(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, phone: user.phone };
}

function pickSender(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

// Admins see all targets regardless of status (no visibility filter for them).
export async function listAllContactsForAdmin(requester, { kind }) {
  const rows = await listAllContacts({ kind });

  const items = [];
  for (const row of rows) {
    if (kind === CONTACT_KIND.LISTING) {
      const listing = await loadListingSnapshot(row.listing_id, requester);
      items.push({ row, listing, property: null });
    } else if (kind === CONTACT_KIND.PROPERTY) {
      const property = await loadPropertySnapshot(row.property_id, requester);
      items.push({ row, listing: null, property });
    } else {
      items.push({ row, listing: null, property: null });
    }
  }

  const userIds = [
    ...new Set(
      [
        ...rows.map((r) => r.user_id),
        ...items.flatMap((i) => [i.listing?.owner_id, i.property?.owner_id]),
      ].filter(Boolean),
    ),
  ];
  const users = await findUsersByIds(userIds);
  const userById = new Map(users.map((u) => [u.id, u]));

  return items.map(({ row, listing, property }) => {
    if (listing) listing.owner = pickOwner(userById.get(listing.owner_id));
    if (property) property.owner = pickOwner(userById.get(property.owner_id));
    return {
      ...shape(row, { listing, property }),
      sender: pickSender(userById.get(row.user_id)),
    };
  });
}
