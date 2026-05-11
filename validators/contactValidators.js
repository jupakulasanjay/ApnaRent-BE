import { z } from "zod"

export const createContactBody = z.object({
  listing_id:  z.coerce.number().int().positive().optional(),
  property_id: z.coerce.number().int().positive().optional(),
  message:     z.string().min(1).max(2000)
}).refine(
  (d) => (d.listing_id != null) !== (d.property_id != null),
  { message: "Provide exactly one of listing_id or property_id", path: ["listing_id"] }
)

export const createGeneralContactBody = z.object({
  subject: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(2000)
})
