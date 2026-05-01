import {
  createProperty,
  getPropertyById,
  updateProperty,
  setPropertyStatus,
  listPropertiesByOwner,
  listPublicProperties
} from "../db/propertyDb.js"
import { addPropertyImages, listPropertyImages } from "../db/propertyImageDb.js"
import { decoratePostedBy, decoratePostedByMany } from "./postedBy.js"

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

async function assertOwnsProperty(propertyId, ownerId) {
  const property = await getPropertyById(propertyId)
  if (!property) throw httpError(404, "Property not found")
  if (property.owner_id !== ownerId) throw httpError(403, "You do not own this property")
  return property
}

export async function createPropertyForUser(requester, data) {
  const created = await createProperty({ ownerId: requester.id, ...data })
  // Admin-created listings are trusted: skip the verification flow and go
  // straight to active, with the admin recorded as the approver.
  const finalRow = requester.role === "admin"
    ? await setPropertyStatus(created.id, { status: "active", approvedBy: requester.id, rejectionReason: null })
    : created
  return decoratePostedBy(finalRow)
}

export async function updatePropertyForUser(requester, propertyId, patch) {
  const property = await assertOwnsProperty(propertyId, requester.id)
  // Owners must unpublish before editing an active property; admins manage
  // their own ApnaRent inventory directly and can edit in place.
  if (property.status === "active" && requester.role !== "admin") {
    throw httpError(409, "Active property cannot be edited; unpublish first")
  }
  const updated = await updateProperty(propertyId, patch)
  return decoratePostedBy(updated)
}

export async function submitPropertyForVerification(requester, propertyId) {
  const property = await assertOwnsProperty(propertyId, requester.id)
  if (property.status !== "draft" && property.status !== "rejected") {
    throw httpError(409, `Property cannot be submitted from status '${property.status}'`)
  }
  const updated = await setPropertyStatus(propertyId, { status: "pending_verification" })
  return decoratePostedBy(updated)
}

export async function addImagesToProperty(requester, propertyId, imageUrls) {
  await assertOwnsProperty(propertyId, requester.id)
  return addPropertyImages(propertyId, imageUrls)
}

export async function listMyProperties(requester) {
  const rows = await listPropertiesByOwner(requester.id)
  const withImages = await Promise.all(
    rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) }))
  )
  return decoratePostedByMany(withImages)
}

export async function listPublic(filters) {
  const rows = await listPublicProperties(filters)
  const withImages = await Promise.all(
    rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) }))
  )
  return decoratePostedByMany(withImages)
}

// Role-aware detail fetch — see listingService.getListingForRequester for rules.
export async function getPropertyForRequester(id, requester) {
  const property = await getPropertyById(id)
  if (!property) throw httpError(404, "Property not found")

  const isAdmin = requester?.role === "admin"
  const isOwner = requester?.id != null && property.owner_id === requester.id
  const isActive = property.status === "active"

  if (!isAdmin && !isOwner && !isActive) {
    throw httpError(404, "Property not found")
  }

  property.images = await listPropertyImages(property.id)
  return decoratePostedBy(property)
}
