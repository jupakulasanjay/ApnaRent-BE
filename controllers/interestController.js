import { addInterest, removeInterest, listUserInterests } from "../models/interestModel.js"
import { getPropertyById } from "../models/propertyModel.js"

export async function markInterest(req, res, next) {
  try {
    const propertyId = parseInt(req.params.id, 10)
    if (!Number.isFinite(propertyId)) return next({ status: 400, message: "Invalid id" })

    const property = await getPropertyById(propertyId)
    if (!property || property.status !== "approved") {
      return next({ status: 404, message: "Property not found" })
    }

    await addInterest(req.user.id, propertyId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export async function unmarkInterest(req, res, next) {
  try {
    const propertyId = parseInt(req.params.id, 10)
    if (!Number.isFinite(propertyId)) return next({ status: 400, message: "Invalid id" })

    await removeInterest(req.user.id, propertyId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export async function myInterests(req, res, next) {
  try {
    const rows = await listUserInterests(req.user.id)
    res.json({ count: rows.length, data: rows })
  } catch (err) {
    next(err)
  }
}
