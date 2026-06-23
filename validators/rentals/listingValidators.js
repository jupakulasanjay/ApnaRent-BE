import { z } from "zod";
import { LISTING_STATUS } from "../../utils/constants.js";

const FURNISHING = ["unfurnished", "semi_furnished", "furnished"];

// Statuses an owner can filter their own rentals by. Intentionally excludes
// 'expired' — the owner dashboard only surfaces these four lifecycle states.
const OWNED_STATUSES = [
  LISTING_STATUS.DRAFT,
  LISTING_STATUS.PENDING,
  LISTING_STATUS.ACTIVE,
  LISTING_STATUS.REJECTED,
];

const MAX_OWNED_PAGE = 100;

const amenitiesArray = z.array(z.string().min(1).max(120)).max(100).optional();

export const createListingBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  rent: z.coerce.number().int().positive(),
  bhk: z.coerce.number().int().min(0).max(20).optional(),
  bathrooms: z.coerce.number().int().min(0).max(20).optional(),
  furnishing: z.enum(FURNISHING).optional(),
  available_from: z.coerce.date().optional(),
  address: z.string().min(1).max(500),
  locality: z.string().min(1).max(120).optional(),
  city: z.string().min(1).max(120).optional(),
  state: z.string().min(1).max(120).optional(),
  pincode: z.string().min(3).max(12).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  amenities: amenitiesArray,
  community_id: z.coerce.number().int().positive().optional(),
});

export const updateListingBody = createListingBody.partial();

export const rejectListingBody = z.object({
  reason: z.string().min(1).max(500),
});

export const publicListingsQuery = z.object({
  city: z.string().min(1).max(120).optional(),
  locality: z.string().min(1).max(120).optional(),
  bhk: z.coerce.number().int().min(0).max(20).optional(),
  max_rent: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// "My rentals" listing query. Unknown status → 400 (zod enum). limit omitted
// → undefined (service returns all matching rows); when present it's clamped
// to [1, MAX_OWNED_PAGE]. offset is clamped to >= 0 and defaults to 0.
export const ownedListingsQuery = z.object({
  status: z.enum(OWNED_STATUSES).optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .transform((v) =>
      v === undefined ? undefined : Math.min(v, MAX_OWNED_PAGE),
    ),
  offset: z.coerce
    .number()
    .int()
    .default(0)
    .transform((v) => Math.max(v, 0)),
});
