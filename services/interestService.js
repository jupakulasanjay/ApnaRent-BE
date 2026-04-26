import {
  createInterest,
  findInterestForUserListing,
  findInterestForUserProperty,
  listInterestsByUser,
  deleteInterestForUserListing,
  deleteInterestForUserProperty
} from "../db/interestDb.js"
import { getListingById } from "../db/listingDb.js"
import { getPropertyById } from "../db/propertyDb.js"
import { listListingImages } from "../db/listingImageDb.js"
import { listPropertyImages } from "../db/propertyImageDb.js"

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Mirrors listingService/propertyService visibility:
//   admin → any status, owner of record → any status, otherwise → active only.
function canView(record, requester) {
  if (!record) return false
  if (requester?.role === "admin") return true
  if (requester?.id != null && record.owner_id === requester.id) return true
  return record.status === "active"
}

async function loadVisibleListing(listingId, requester) {
  const listing = await getListingById(listingId)
  if (!canView(listing, requester)) return null
  listing.images = await listListingImages(listing.id)
  return listing
}

async function loadVisibleProperty(propertyId, requester) {
  const property = await getPropertyById(propertyId)
  if (!canView(property, requester)) return null
  property.images = await listPropertyImages(property.id)
  return property
}

function shapeListingInterest(row, listing) {
  return {
    id: row.id,
    kind: "listing",
    target_id: row.listing_id,
    created_at: row.created_at,
    listing
  }
}

function shapePropertyInterest(row, property) {
  return {
    id: row.id,
    kind: "property",
    target_id: row.property_id,
    created_at: row.created_at,
    property
  }
}

export async function listInterestsForUser(requester) {
  const rows = await listInterestsByUser(requester.id)
  const out = []
  for (const row of rows) {
    if (row.listing_id != null) {
      const listing = await loadVisibleListing(row.listing_id, requester)
      if (listing) out.push(shapeListingInterest(row, listing))
    } else if (row.property_id != null) {
      const property = await loadVisibleProperty(row.property_id, requester)
      if (property) out.push(shapePropertyInterest(row, property))
    }
  }
  return out
}

export async function saveInterest(requester, { listingId, propertyId }) {
  if ((listingId == null) === (propertyId == null)) {
    throw httpError(400, "Provide exactly one of listing_id or property_id")
  }

  if (listingId != null) {
    const listing = await loadVisibleListing(listingId, requester)
    if (!listing) throw httpError(404, "Listing not found")

    const existing = await findInterestForUserListing(requester.id, listingId)
    if (existing) {
      return { interest: shapeListingInterest(existing, listing), created: false }
    }
    const row = await createInterest({ userId: requester.id, listingId })
    return { interest: shapeListingInterest(row, listing), created: true }
  }

  const property = await loadVisibleProperty(propertyId, requester)
  if (!property) throw httpError(404, "Property not found")

  const existing = await findInterestForUserProperty(requester.id, propertyId)
  if (existing) {
    return { interest: shapePropertyInterest(existing, property), created: false }
  }
  const row = await createInterest({ userId: requester.id, propertyId })
  return { interest: shapePropertyInterest(row, property), created: true }
}

export async function removeInterest(requester, { kind, targetId }) {
  const removed = kind === "listing"
    ? await deleteInterestForUserListing(requester.id, targetId)
    : await deleteInterestForUserProperty(requester.id, targetId)
  if (!removed) throw httpError(404, "Interest not found")
}
