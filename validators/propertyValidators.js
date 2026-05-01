import { z } from "zod"

const PROPERTY_TYPES = ["land", "plot", "apartment", "villa", "house", "commercial"]

const amenitiesArray = z.array(z.string().min(1).max(120)).max(100).optional()

export const createPropertyBody = z.object({
  title:         z.string().min(1).max(200),
  description:   z.string().max(5000).optional(),
  price:         z.coerce.number().int().positive(),
  property_type: z.enum(PROPERTY_TYPES),
  area_sqft:     z.coerce.number().int().positive().optional(),
  address:       z.string().min(1).max(500),
  locality:      z.string().min(1).max(120).optional(),
  city:          z.string().min(1).max(120).optional(),
  amenities:     amenitiesArray
})

export const updatePropertyBody = createPropertyBody.partial()

export const rejectPropertyBody = z.object({
  reason: z.string().min(1).max(500)
})

export const publicPropertiesQuery = z.object({
  city:          z.string().min(1).max(120).optional(),
  locality:      z.string().min(1).max(120).optional(),
  property_type: z.enum(PROPERTY_TYPES).optional(),
  min_price:     z.coerce.number().int().nonnegative().optional(),
  max_price:     z.coerce.number().int().positive().optional(),
  limit:         z.coerce.number().int().min(1).max(100).default(20),
  offset:        z.coerce.number().int().min(0).default(0)
})
