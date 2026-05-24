import { z } from "zod";
import { INTEREST_KIND } from "../../utils/constants.js";

export const createInterestBody = z.object({
  listing_id: z.coerce.number().int().positive(),
});

export const interestPathParams = z.object({
  kind: z.literal(INTEREST_KIND.LISTING),
  id: z.coerce.number().int().positive(),
});
