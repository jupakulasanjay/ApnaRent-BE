import {
  createListing,
  getListingById,
  updateListing,
  setListingStatus,
  listListingsByOwner,
  listPublicListings
} from "../db/listingDb.js"
import { addListingImages, listListingImages } from "../db/listingImageDb.js"
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

export async function listPublic(filters) {
  const rows = await listPublicListings(filters)
  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) }))
  )
  return decoratePostedByMany(withImages)
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
