import { z } from "zod";

// `kind` is validated at the controller against the DB. Keeping the validator
// schema-loose (just a non-empty string when present) avoids loading the
// catalogue on every request, and the controller already returns 400 with the
// supported list on unknown values.
export const amenitiesQuery = z.object({
  kind: z.string().min(1).optional(),
});
