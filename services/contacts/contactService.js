import { createContact, listAllContacts } from "../../db/contacts/contactDb.js";
import {
  getPublicListingById,
  getListingById,
} from "../../db/listings/listingDb.js";
import { listListingImages } from "../../db/listings/listingImageDb.js";
import { findUsersByIds } from "../../db/users/userDb.js";
import { httpError } from "../../utils/httpError.js";
import {
  CONTACT_KIND,
  LISTING_STATUS,
  USER_ROLE,
} from "../../utils/constants.js";

export async function submitContact({ userId, listingId, message }) {
  const listing = await getPublicListingById(listingId);
  if (!listing) throw httpError(404, "Listing not found or not active");
  return createContact({ userId, listingId, message });
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

function inferKind(row) {
  if (row.listing_id != null) return CONTACT_KIND.LISTING;
  return CONTACT_KIND.GENERAL;
}

function shape(row, { listing = null } = {}) {
  return {
    id: row.id,
    kind: inferKind(row),
    target_id: row.listing_id ?? null,
    subject: row.subject ?? null,
    message: row.message,
    created_at: row.created_at,
    listing,
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
      items.push({ row, listing });
    } else {
      items.push({ row, listing: null });
    }
  }

  const userIds = [
    ...new Set(
      [
        ...rows.map((r) => r.user_id),
        ...items.flatMap((i) => [i.listing?.owner_id]),
      ].filter(Boolean),
    ),
  ];
  const users = await findUsersByIds(userIds);
  const userById = new Map(users.map((u) => [u.id, u]));

  return items.map(({ row, listing }) => {
    if (listing) listing.owner = pickOwner(userById.get(listing.owner_id));
    return {
      ...shape(row, { listing }),
      sender: pickSender(userById.get(row.user_id)),
    };
  });
}
