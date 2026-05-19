import {
  createListing,
  getListingById,
  updateListing,
  setListingStatus,
  listListingsByOwner,
  listPublicListings,
  countPublicListings,
  deleteListing
} from "../db/listingDb.js"
import { resolveLocalityCentroid } from "./geocodeService.js"

const PUBLIC_LIST_RADIUS_KM = 15
import {
  addListingImages,
  listListingImages,
  getListingImage,
  deleteListingImage
} from "../db/listingImageDb.js"
import { deleteObject, deleteObjects, s3KeyFromUrl } from "./s3Service.js"
import { decoratePostedBy, decoratePostedByMany } from "./postedBy.js"

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

async function assertOwnsListing(listingId, ownerId) {
  const listing = await getListingById(listingId)
  if (!listing) throw httpError(404, "Listing not found")
  if (listing.owner_id !== ownerId) throw httpError(403, "You do not own this listing")
  return listing
}

export async function createListingForOwner(ownerId, data) {
  const created = await createListing({ ownerId, ...data })
  return decoratePostedBy(created)
}

export async function updateListingForOwner(ownerId, listingId, patch) {
  const listing = await assertOwnsListing(listingId, ownerId)
  if (listing.status === "active") {
    throw httpError(409, "Active listing cannot be edited; unpublish first")
  }
  const updated = await updateListing(listingId, patch)
  return decoratePostedBy(updated)
}

export async function submitListingForVerification(ownerId, listingId) {
  const listing = await assertOwnsListing(listingId, ownerId)
  if (listing.status !== "draft" && listing.status !== "rejected") {
    throw httpError(409, `Listing cannot be submitted from status '${listing.status}'`)
  }
  const updated = await setListingStatus(listingId, { status: "pending_verification" })
  return decoratePostedBy(updated)
}

export async function addImagesToListing(ownerId, listingId, imageUrls) {
  await assertOwnsListing(listingId, ownerId)
  return addListingImages(listingId, imageUrls)
}

export async function listMyListings(ownerId) {
  const rows = await listListingsByOwner(ownerId)
  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) }))
  )
  return decoratePostedByMany(withImages)
}

// Public rental browse. When a `locality` is supplied, resolve it to a
// centroid via the Google-backed geocode cache (`localities` table →
// Google fallback on miss) and upgrade to a 15km geo-radius filter
// ranked by distance ASC. If the locality can't be resolved, fall back
// to literal ILIKE. `total` reflects the count after the same filter
// is applied — not just the current page.
export async function listPublic(filters) {
  const centroid = filters.locality
    ? await resolveLocalityCentroid(filters.city || "Bangalore", filters.locality)
    : null

  const dbArgs = centroid
    ? { ...filters, centroid, radiusKm: PUBLIC_LIST_RADIUS_KM }
    : filters

  const [rows, total] = await Promise.all([
    listPublicListings(dbArgs),
    countPublicListings(dbArgs)
  ])

  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) }))
  )
  const decorated = await decoratePostedByMany(withImages)
  return { rows: decorated, total }
}

// Returns the listing if the requester may mutate/delete it. Owners may
// touch only their own listings; admins may touch any. Status gate is layered
// on top (owners blocked when active; admins unrestricted).
async function assertCanDelete(requester, listingId) {
  const listing = await getListingById(listingId)
  if (!listing) throw httpError(404, "Listing not found")

  const isAdmin = requester.role === "admin"
  const isOwner = listing.owner_id === requester.id
  if (!isAdmin && !isOwner) throw httpError(404, "Listing not found")

  if (!isAdmin && listing.status === "active") {
    throw httpError(403, "Active listing cannot be deleted; unpublish first")
  }
  return listing
}

export async function removeListingImage(requester, listingId, imageId) {
  await assertCanDelete(requester, listingId)

  const image = await getListingImage(listingId, imageId)
  if (!image) throw httpError(404, "Image not found")

  const key = s3KeyFromUrl(image.image_url)
  if (key) await deleteObject(key)

  await deleteListingImage(listingId, imageId)
}

export async function removeListing(requester, listingId) {
  await assertCanDelete(requester, listingId)

  const images = await listListingImages(listingId)
  const keys = images.map((img) => s3KeyFromUrl(img.image_url)).filter(Boolean)

  await deleteListing(listingId)

  if (keys.length) {
    const { errors } = await deleteObjects(keys)
    if (errors.length) {
      console.error(`Orphaned S3 objects for deleted listing ${listingId}:`, errors)
    }
  }
}

// Role-aware detail fetch. Visibility rules:
//   admin                         → any status
//   owner (owner_id === me)       → any status
//   tenant / anonymous / other    → active only
// Non-visible records return 404 (never 403) so we don't leak existence.
export async function getListingForRequester(id, requester) {
  const listing = await getListingById(id)
  if (!listing) throw httpError(404, "Listing not found")

  const isAdmin = requester?.role === "admin"
  const isOwner = requester?.id != null && listing.owner_id === requester.id
  const isActive = listing.status === "active"

  if (!isAdmin && !isOwner && !isActive) {
    throw httpError(404, "Listing not found")
  }

  listing.images = await listListingImages(listing.id)
  return decoratePostedBy(listing)
}
