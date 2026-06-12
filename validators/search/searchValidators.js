import { z } from "zod";

// Hybrid body: either a free-text NL `query`, an explicit `filters` object,
// or both. At least one must be present. Explicit filter fields take
// precedence over NL-extracted ones in the service layer.
//
// `localities` is always an array (possibly empty). The string-singular
// `locality` form is no longer accepted — FE must send `localities: [...]`.
export const searchBody = z
  .object({
    query: z.string().min(1).max(500).optional(),
    filters: z
      .object({
        bhk: z.number().int().positive().nullish(),
        localities: z.array(z.string().min(1)).nullish(),
        city: z.string().min(1).nullish(),
        min_rent: z.number().int().nonnegative().nullish(),
        max_rent: z.number().int().positive().nullish(),
        amenities: z.array(z.string().min(1)).nullish(),
      })
      .optional(),
  })
  .refine(
    (v) =>
      (v.query && v.query.trim().length > 0) ||
      (v.filters &&
        Object.values(v.filters).some(
          (x) => x != null && (!Array.isArray(x) || x.length > 0),
        )),
    {
      message: "At least one of `query` or non-empty `filters` is required",
    },
  )
  .refine(
    (v) =>
      !v.filters ||
      v.filters.min_rent == null ||
      v.filters.max_rent == null ||
      v.filters.min_rent <= v.filters.max_rent,
    {
      message: "min_rent must be <= max_rent",
      path: ["filters", "min_rent"],
    },
  );

// Property-for-sale search. Mirrors `searchBody` but with `min_price` /
// `max_price` in place of `min_rent` / `max_rent`, and `property_type`
// (residential | plot | commercial) in place of `bhk`.
export const propertySearchBody = z
  .object({
    query: z.string().min(1).max(500).optional(),
    filters: z
      .object({
        property_type: z
          .array(z.enum(["residential", "plot", "commercial"]))
          .nullish(),
        localities: z.array(z.string().min(1)).nullish(),
        city: z.string().min(1).nullish(),
        min_price: z.number().int().nonnegative().nullish(),
        max_price: z.number().int().positive().nullish(),
        amenities: z.array(z.string().min(1)).nullish(),
      })
      .optional(),
  })
  .refine(
    (v) =>
      (v.query && v.query.trim().length > 0) ||
      (v.filters &&
        Object.values(v.filters).some(
          (x) => x != null && (!Array.isArray(x) || x.length > 0),
        )),
    {
      message: "At least one of `query` or non-empty `filters` is required",
    },
  )
  .refine(
    (v) =>
      !v.filters ||
      v.filters.min_price == null ||
      v.filters.max_price == null ||
      v.filters.min_price <= v.filters.max_price,
    {
      message: "min_price must be <= max_price",
      path: ["filters", "min_price"],
    },
  );
