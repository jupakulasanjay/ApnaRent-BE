import { z } from "zod";
import { LISTING_STATUS } from "../../utils/constants.js";

export const PROPERTY_TYPES = ["residential", "plot", "commercial"];
export const PROPERTY_FACINGS = [
  "north",
  "south",
  "east",
  "west",
  "north_east",
  "north_west",
  "south_east",
  "south_west",
];
const FURNISHING = ["unfurnished", "semi_furnished", "furnished"];

const OWNED_STATUSES = [
  LISTING_STATUS.DRAFT,
  LISTING_STATUS.PENDING,
  LISTING_STATUS.ACTIVE,
  LISTING_STATUS.REJECTED,
];

const MAX_OWNED_PAGE = 100;

const amenitiesArray = z.array(z.string().min(1).max(120)).max(100).optional();

// Mirrors createListingBody, with `rent` → `price` and `bhk` → `property_type`.
export const createPropertyBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  price: z.coerce.number().int().positive(),
  property_type: z.enum(PROPERTY_TYPES),
  area: z.coerce.number().int().positive().optional(),
  property_facing: z.enum(PROPERTY_FACINGS).optional(),
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

export const updatePropertyBody = createPropertyBody.partial();

export const rejectPropertyBody = z.object({
  reason: z.string().min(3).max(500),
});

export const publicPropertiesQuery = z.object({
  city: z.string().min(1).max(120).optional(),
  locality: z.string().min(1).max(120).optional(),
  property_type: z.enum(PROPERTY_TYPES).optional(),
  property_facing: z.enum(PROPERTY_FACINGS).optional(),
  max_price: z.coerce.number().int().positive().optional(),
  max_area: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ownedPropertiesQuery = z.object({
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
