import {
  createProperty,
  getPropertyById,
  updateProperty,
  setPropertyStatus,
  listPropertiesByOwner,
  listPublicProperties,
  getPublicPropertyById
} from "../db/propertyDb.js"
import { addPropertyImages, listPropertyImages } from "../db/propertyImageDb.js"

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

export async function createPropertyForOwner(ownerId, data) {
  return createProperty({ ownerId, ...data })
}

export async function updatePropertyForOwner(ownerId, propertyId, patch) {
  const property = await assertOwnsProperty(propertyId, ownerId)
  if (property.status === "active") {
    throw httpError(409, "Active property cannot be edited; unpublish first")
  }
  return updateProperty(propertyId, patch)
}

export async function submitPropertyForVerification(ownerId, propertyId) {
  const property = await assertOwnsProperty(propertyId, ownerId)
  if (property.status !== "draft" && property.status !== "rejected") {
    throw httpError(409, `Property cannot be submitted from status '${property.status}'`)
  }
  return setPropertyStatus(propertyId, { status: "pending_verification" })
}

export async function addImagesToProperty(ownerId, propertyId, imageUrls) {
  await assertOwnsProperty(propertyId, ownerId)
  return addPropertyImages(propertyId, imageUrls)
}

export async function listMyProperties(ownerId) {
  const rows = await listPropertiesByOwner(ownerId)
  return Promise.all(rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) })))
}

export async function listPublic(filters) {
  const rows = await listPublicProperties(filters)
  return Promise.all(rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) })))
}

export async function getPublicProperty(id) {
  const property = await getPublicPropertyById(id)
  if (!property) throw httpError(404, "Property not found")
  property.images = await listPropertyImages(property.id)
  return property
}
