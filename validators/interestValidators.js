import { z } from "zod"

export const createInterestBody = z.object({
  listing_id:  z.coerce.number().int().positive().optional(),
  property_id: z.coerce.number().int().positive().optional()
}).refine(
  (d) => (d.listing_id != null) !== (d.property_id != null),
  { message: "Provide exactly one of listing_id or property_id", path: ["listing_id"] }
)

export const interestPathParams = z.object({
  kind: z.enum(["listing", "property"]),
  id:   z.coerce.number().int().positive()
})
