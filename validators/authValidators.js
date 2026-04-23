import { z } from "zod"

const email = z.string().trim().toLowerCase().email()
const phone = z.string().trim().min(7).max(20)

export const registerBody = z.object({
  email,
  password: z.string().min(8).max(128),
  name:     z.string().trim().min(1).max(120).optional(),
  phone:    phone.optional(),
  role:     z.enum(["tenant", "owner"])
})

export const loginBody = z.object({
  email,
  password: z.string().min(1),
  role:     z.enum(["tenant", "owner", "admin"])
})
