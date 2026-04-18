import {
  listProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty
} from "../models/propertyModel.js"

const ADDRESS_FIELDS = [
  "address_line",
  "building_name",
  "landmark",
  "sub_locality",
  "locality",
  "city",
  "district",
  "state",
  "country",
  "country_code",
  "pincode",
  "formatted_address",
  "place_id"
]

function parseNumber(value, { integer = false } = {}) {
  if (value === undefined || value === null || value === "") return undefined
  const n = integer ? parseInt(value, 10) : parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "")
  if (missing.length) {
    const err = new Error(`Missing required fields: ${missing.join(", ")}`)
    err.status = 400
    throw err
  }
}

function pickAddress(body) {
  const out = {}
  for (const field of ADDRESS_FIELDS) {
    if (body[field] !== undefined) out[field] = body[field] || null
  }
  return out
}

export async function getProperties(req, res, next) {
  try {
    const { city } = req.query
    const lat = parseNumber(req.query.lat)
    const lng = parseNumber(req.query.lng)
    const radiusKm = parseNumber(req.query.radiusKm)
    const limit = Math.min(parseNumber(req.query.limit, { integer: true }) || 20, 100)
    const offset = parseNumber(req.query.offset, { integer: true }) || 0

    const rows = await listProperties({ city, lat, lng, radiusKm, limit, offset })
    res.json({ count: rows.length, limit, offset, data: rows })
  } catch (err) {
    next(err)
  }
}

export async function getProperty(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return next({ status: 400, message: "Invalid id" })

    const property = await getPropertyById(id)
    if (!property) return next({ status: 404, message: "Property not found" })
    res.json(property)
  } catch (err) {
    next(err)
  }
}

export async function createPropertyHandler(req, res, next) {
  try {
    requireFields(req.body, ["title", "price"])

    const property = await createProperty({
      title: req.body.title,
      description: req.body.description || null,
      price: parseNumber(req.body.price, { integer: true }),
      latitude: parseNumber(req.body.latitude),
      longitude: parseNumber(req.body.longitude),
      images: req.imagePaths || [],
      ...pickAddress(req.body)
    })

    res.status(201).json(property)
  } catch (err) {
    next(err)
  }
}

export async function updatePropertyHandler(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return next({ status: 400, message: "Invalid id" })

    const existing = await getPropertyById(id)
    if (!existing) return next({ status: 404, message: "Property not found" })

    const patch = {
      title: req.body.title,
      description: req.body.description,
      price: parseNumber(req.body.price, { integer: true }),
      latitude: parseNumber(req.body.latitude),
      longitude: parseNumber(req.body.longitude),
      ...pickAddress(req.body)
    }

    // Newly uploaded images are appended by default. Pass replaceImages=true to replace.
    if (req.imagePaths && req.imagePaths.length > 0) {
      patch.images = req.body.replaceImages === "true"
        ? req.imagePaths
        : [...(existing.images || []), ...req.imagePaths]
    }

    const updated = await updateProperty(id, patch)
    res.json(updated)
  } catch (err) {
    next(err)
  }
}

export async function deletePropertyHandler(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return next({ status: 400, message: "Invalid id" })

    const ok = await deleteProperty(id)
    if (!ok) return next({ status: 404, message: "Property not found" })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
