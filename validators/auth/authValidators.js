import { z } from "zod";
import { USER_ROLE } from "../../utils/constants.js";

const email = z.string().trim().toLowerCase().email();
const phone = z.string().trim().min(7).max(20);

export const registerBody = z.object({
  email,
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(120).optional(),
  phone: phone.optional(),
  role: z.enum([USER_ROLE.TENANT, USER_ROLE.OWNER]),
});

export const loginBody = z.object({
  email,
  password: z.string().min(1),
  role: z.enum([USER_ROLE.TENANT, USER_ROLE.OWNER, USER_ROLE.ADMIN]),
});
