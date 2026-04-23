import { getListingById, setListingStatus, listListingsByStatus } from "../db/listingDb.js"
import { listListingImages } from "../db/listingImageDb.js"
import { getPropertyById, setPropertyStatus, listPropertiesByStatus } from "../db/propertyDb.js"
import { listPropertyImages } from "../db/propertyImageDb.js"

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// ---------- listings ----------

export async function listPendingListings() {
  const rows = await listListingsByStatus({ status: "pending_verification", limit: 100 })
  return Promise.all(rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) })))
}

export async function approveListing(listingId, adminId) {
  const listing = await getListingById(listingId)
  if (!listing) throw httpError(404, "Listing not found")
  if (listing.status !== "pending_verification") {
    throw httpError(409, `Only pending_verification listings can be approved (got '${listing.status}')`)
  }
  return setListingStatus(listingId, { status: "active", approvedBy: adminId, rejectionReason: null })
}

export async function rejectListing(listingId, adminId, reason) {
  const listing = await getListingById(listingId)
  if (!listing) throw httpError(404, "Listing not found")
  if (listing.status !== "pending_verification") {
    throw httpError(409, `Only pending_verification listings can be rejected (got '${listing.status}')`)
  }
  return setListingStatus(listingId, { status: "rejected", approvedBy: adminId, rejectionReason: reason })
}

// ---------- properties ----------

export async function listPendingProperties() {
  const rows = await listPropertiesByStatus({ status: "pending_verification", limit: 100 })
  return Promise.all(rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) })))
}

export async function approveProperty(propertyId, adminId) {
  const property = await getPropertyById(propertyId)
  if (!property) throw httpError(404, "Property not found")
  if (property.status !== "pending_verification") {
    throw httpError(409, `Only pending_verification properties can be approved (got '${property.status}')`)
  }
  return setPropertyStatus(propertyId, { status: "active", approvedBy: adminId, rejectionReason: null })
}

export async function rejectProperty(propertyId, adminId, reason) {
  const property = await getPropertyById(propertyId)
  if (!property) throw httpError(404, "Property not found")
  if (property.status !== "pending_verification") {
    throw httpError(409, `Only pending_verification properties can be rejected (got '${property.status}')`)
  }
  return setPropertyStatus(propertyId, { status: "rejected", approvedBy: adminId, rejectionReason: reason })
}
