import { z } from "zod";

export const createContactBody = z.object({
  listing_id: z.coerce.number().int().positive(),
  message: z.string().min(1).max(2000),
});

export const createGeneralContactBody = z.object({
  subject: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(2000),
});
