import { z } from "zod"

const FURNISHING = ["unfurnished", "semi_furnished", "furnished"]

const amenitiesArray = z.array(z.string().min(1).max(120)).max(100).optional()

export const createListingBody = z.object({
  title:          z.string().min(1).max(200),
  description:    z.string().max(5000).optional(),
  rent:           z.coerce.number().int().positive(),
  bhk:            z.coerce.number().int().min(0).max(20).optional(),
  bathrooms:      z.coerce.number().int().min(0).max(20).optional(),
  furnishing:     z.enum(FURNISHING).optional(),
  available_from: z.coerce.date().optional(),
  address:        z.string().min(1).max(500),
  locality:       z.string().min(1).max(120).optional(),
  city:           z.string().min(1).max(120).optional(),
  amenities:      amenitiesArray
})

export const updateListingBody = createListingBody.partial()

export const rejectListingBody = z.object({
  reason: z.string().min(1).max(500)
})

export const publicListingsQuery = z.object({
  city:     z.string().min(1).max(120).optional(),
  locality: z.string().min(1).max(120).optional(),
  bhk:      z.coerce.number().int().min(0).max(20).optional(),
  max_rent: z.coerce.number().int().positive().optional(),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  offset:   z.coerce.number().int().min(0).default(0)
})
