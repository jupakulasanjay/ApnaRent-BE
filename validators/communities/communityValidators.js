import { z } from "zod";
import { COMMUNITY_TYPE } from "../../utils/constants.js";

export const COMMUNITY_TYPES = Object.values(COMMUNITY_TYPE);

const amenitiesArray = z.array(z.string().min(1).max(120)).max(100).optional();

export const createCommunityBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  community_type: z.enum(COMMUNITY_TYPES),
  towers: z.coerce.number().int().min(0).max(1000).optional(),
  acres: z.coerce.number().min(0).max(100000).optional(),
  address: z.string().min(1).max(500).optional(),
  locality: z.string().min(1).max(120).optional(),
  city: z.string().min(1).max(120).optional(),
  state: z.string().min(1).max(120).optional(),
  pincode: z.string().min(3).max(12).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  amenities: amenitiesArray,
});

export const updateCommunityBody = createCommunityBody.partial();

export const publicCommunitiesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const linkRentalsBody = z.object({
  listing_ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
});

export const linkPropertiesBody = z.object({
  property_ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
});
