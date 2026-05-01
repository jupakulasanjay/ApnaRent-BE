import { createContact } from "../db/contactDb.js"
import { getPublicListingById } from "../db/listingDb.js"
import { getPublicPropertyById } from "../db/propertyDb.js"

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

export async function submitContact({ userId, listingId, propertyId, message }) {
  if (listingId) {
    const listing = await getPublicListingById(listingId)
    if (!listing) throw httpError(404, "Listing not found or not active")
    return createContact({ userId, listingId, message })
  }
  if (propertyId) {
    const property = await getPublicPropertyById(propertyId)
    if (!property) throw httpError(404, "Property not found or not active")
    return createContact({ userId, propertyId, message })
  }
  // Validator enforces XOR upstream; this is defensive.
  throw httpError(400, "Provide exactly one of listing_id or property_id")
}
