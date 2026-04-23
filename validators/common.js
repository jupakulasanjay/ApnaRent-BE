import { z } from "zod"

export const idParam = z.object({
  id: z.coerce.number().int().positive()
})

export const paginationQuery = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
})
