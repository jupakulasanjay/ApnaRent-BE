import { z } from "zod";
import { SUPPORTED_KINDS } from "../../config/amenities.js";

export const amenitiesQuery = z.object({
  kind: z.enum(SUPPORTED_KINDS),
});
