import Anthropic from "@anthropic-ai/sdk";
import { searchPublicListings } from "../db/listingDb.js";
import { listListingImages } from "../db/listingImageDb.js";
import { resolveLocalityCentroid } from "./geocodeService.js";
import { decoratePostedByMany } from "./postedBy.js";
import { SEARCH_RADIUS_KM } from "./_searchConfig.js";

const DEFAULT_RADIUS_KM = SEARCH_RADIUS_KM;
const SUGGESTION_CAP = 10;
const PRICE_RELAX_FACTOR = 1.2;

const LISTING_FILTER_SCHEMA = {
  type: "object",
  properties: {
    bhk: {
      type: ["integer", "null"],
      description: "Number of bedrooms (e.g. 2 for 2BHK)",
    },
    locality: {
      type: ["string", "null"],
      description: "Neighborhood or area name (e.g. 'Whitefield')",
    },
    city: {
      type: ["string", "null"],
      description: "City name (e.g. 'Bangalore')",
    },
    max_rent: {
      type: ["integer", "null"],
      description: "Maximum monthly rent in INR",
    },
  },
  required: ["bhk", "locality", "city", "max_rent"],
  additionalProperties: false,
};

const LISTING_SYSTEM_PROMPT = `You extract structured rental-search filters from a user's natural-language query.
Return ONLY the filter object via the extract_filters tool. Use null for any field not mentioned.
Normalize rent expressions: "60k" → 60000, "1.2 lakh" → 120000.`;

async function extractListingFiltersWithClaude(query) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: LISTING_SYSTEM_PROMPT,
    tools: [
      {
        name: "extract_filters",
        description: "Extract structured rental search filters",
        input_schema: LISTING_FILTER_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "extract_filters" },
    messages: [{ role: "user", content: query }],
  });
  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse) throw new Error("Claude returned no tool use");
  return toolUse.input;
}

function extractListingFiltersWithRegex(query) {
  const q = query.toLowerCase();

  const bhkMatch = q.match(/(\d+)\s*bhk/);
  const bhk = bhkMatch ? parseInt(bhkMatch[1], 10) : null;

  const rentMatch =
    q.match(/under\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/below\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/<\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/);
  let max_rent = null;
  if (rentMatch) {
    const n = parseFloat(rentMatch[1]);
    const unit = rentMatch[2];
    if (unit === "k") max_rent = Math.round(n * 1000);
    else if (unit === "lakh" || unit === "lac" || unit === "l")
      max_rent = Math.round(n * 100000);
    else max_rent = Math.round(n);
  }

  const nearMatch = q.match(
    /(?:near|in|at)\s+([a-z][a-z\s]+?)(?:\s+under|\s+below|\s+<|\s*$)/,
  );
  const locality = nearMatch ? nearMatch[1].trim() : null;

  return { bhk, locality, city: null, max_rent };
}

// LLMs occasionally return string sentinels like "<UNKNOWN>" or "" instead
// of null when a field isn't present. Coerce these to null before they hit
// the DB layer — otherwise `city ILIKE '<UNKNOWN>'` filters everything out.
const NULLISH_STRINGS = new Set([
  "",
  "unknown",
  "<unknown>",
  "n/a",
  "na",
  "none",
  "null",
]);
function nullifySentinel(v) {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  return NULLISH_STRINGS.has(trimmed.toLowerCase()) ? null : trimmed;
}

async function hydrateListings(rows) {
  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) })),
  );
  return decoratePostedByMany(withImages);
}

// Top up `target` from `candidates`, skipping ids already in `excludeIds`,
// stopping at `cap`. Mutates target + excludeIds in place.
function appendUniqueById(target, candidates, excludeIds, cap) {
  for (const row of candidates) {
    if (target.length >= cap) break;
    if (excludeIds.has(row.id)) continue;
    target.push(row);
    excludeIds.add(row.id);
  }
}

export async function naturalLanguageSearch(query) {
  let rawFilters;
  try {
    rawFilters = process.env.ANTHROPIC_API_KEY
      ? await extractListingFiltersWithClaude(query)
      : extractListingFiltersWithRegex(query);
  } catch {
    rawFilters = { bhk: null, locality: null, city: null, max_rent: null };
  }

  const filters = {
    bhk: rawFilters.bhk ?? null,
    locality: nullifySentinel(rawFilters.locality) ?? null,
    city: nullifySentinel(rawFilters.city) ?? null,
    max_rent: rawFilters.max_rent ?? null,
  };

  const centroid = filters.locality
    ? await resolveLocalityCentroid(filters.city, filters.locality)
    : null;

  // Strict pass — DEFAULT_RADIUS_KM around centroid when resolved,
  // literal locality/city ILIKE otherwise.
  const strictRows = await searchPublicListings({
    city: filters.city || undefined,
    locality: filters.locality || undefined,
    bhk: filters.bhk ?? undefined,
    maxRent: filters.max_rent ?? undefined,
    centroid,
    radiusKm: centroid ? DEFAULT_RADIUS_KM : undefined,
    limit: 50,
  });

  if (strictRows.length > 0) {
    return {
      filters,
      results: await hydrateListings(strictRows),
      suggestions: [],
      suggestion_reason: null,
    };
  }

  // Suggestion ladder. Each rung tops up from where the previous stopped.
  const seen = new Set();
  const collected = [];

  // Rung 1: drop radius, keep literal locality/city if any
  if (collected.length < SUGGESTION_CAP) {
    const r1 = await searchPublicListings({
      city: filters.city || undefined,
      locality: filters.locality || undefined,
      bhk: filters.bhk ?? undefined,
      maxRent: filters.max_rent ?? undefined,
      limit: SUGGESTION_CAP,
    });
    appendUniqueById(collected, r1, seen, SUGGESTION_CAP);
  }

  // Rung 2: relax max_rent by +20%
  if (collected.length < SUGGESTION_CAP && filters.max_rent != null) {
    const r2 = await searchPublicListings({
      city: filters.city || undefined,
      locality: filters.locality || undefined,
      bhk: filters.bhk ?? undefined,
      maxRent: Math.round(filters.max_rent * PRICE_RELAX_FACTOR),
      limit: SUGGESTION_CAP,
    });
    appendUniqueById(collected, r2, seen, SUGGESTION_CAP);
  }

  return {
    filters,
    results: [],
    suggestions: collected.length ? await hydrateListings(collected) : [],
    suggestion_reason: collected.length ? "no-exact-matches" : null,
  };
}
