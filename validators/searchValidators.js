import { z } from "zod"

export const searchBody = z.object({
  query: z.string().min(1).max(500)
})
