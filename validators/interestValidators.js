import { z } from "zod";

export const createInterestBody = z.object({
  listing_id: z.coerce.number().int().positive(),
});

export const interestPathParams = z.object({
  kind: z.literal("listing"),
  id: z.coerce.number().int().positive(),
});
