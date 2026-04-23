import * as contactService from "../services/contactService.js"

export async function create(req, res, next) {
  try {
    const contact = await contactService.submitContact({
      userId: req.user.id,
      listingId: req.body.listing_id,
      propertyId: req.body.property_id,
      message: req.body.message
    })
    res.status(201).json(contact)
  } catch (err) {
    next(err)
  }
}
