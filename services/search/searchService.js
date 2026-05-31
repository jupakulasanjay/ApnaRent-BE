import Anthropic from "@anthropic-ai/sdk";
import { searchPublicListings } from "../../db/listings/listingDb.js";
import { listListingImages } from "../../db/listings/listingImageDb.js";
import { resolveLocalityCentroid } from "../_shared/geocodeService.js";
import { decoratePostedByMany } from "../_shared/postedBy.js";
import { SEARCH_RADIUS_KM } from "./_searchConfig.js";
import {
  BANGALORE_LOCALITIES,
  canonicalizeLocality,
} from "./_bangaloreLocalities.js";
import { buildSummary } from "./_summary.js";

const DEFAULT_RADIUS_KM = SEARCH_RADIUS_KM;
const STRICT_RESULT_LIMIT = 50;
const SUGGESTION_CAP = 10;
const PRICE_RELAX_FACTOR = 1.2;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const FILTER_EXTRACTION_MAX_TOKENS = 256;

const LISTING_FILTER_SCHEMA = {
  type: "object",
  properties: {
    bhk: {
      type: ["integer", "null"],
      description: "Number of bedrooms (e.g. 2 for 2BHK)",
    },
    locality: {
      type: ["string", "null"],
      // Enum forces Claude to a value the FE locality dropdown actually
      // contains, so search filters round-trip cleanly with the FE.
      enum: [...BANGALORE_LOCALITIES, null],
      description:
        "Bangalore locality name. MUST be one of the enum values, or null if the user did not name a known Bangalore locality.",
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
Normalize rent expressions: "60k" → 60000, "1.2 lakh" → 120000.

Locality matching:
  - The locality field MUST be one of the enum values in the tool schema, or null.
  - Map common colloquial / abbreviated names to their canonical entries:
      "KR Puram" / "K R Puram" / "Krishnaraja Puram" → "Krishnarajapuram"
      "HSR" → "HSR Layout"
      "BTM" → "BTM Layout"
      "JP Nagar" / "J P Nagar" → "J. P. Nagar"
      "CV Raman Nagar" → "C V Raman Nagar"
      "MG Road" / "M G Road" → "MG Road"
      "Doddanakundi" → "Doddanekkundi"
  - If the user typed a locality that does not appear in the enum (even after
    common-name mapping), return null. Do NOT invent a value.`;

async function extractListingFiltersWithClaude(query) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: FILTER_EXTRACTION_MAX_TOKENS,
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

// LLMs occasionally return "<UNKNOWN>", "n/a", "" etc. instead of null when a
// field isn't present. Coerce these — otherwise `city ILIKE '<UNKNOWN>'`
// filters everything out.
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

  // Canonicalize locality through the FE-mirrored vocabulary: normalizes
  // Claude's enum output, coerces regex free text to canonical names, and
  // returns null for anything not in the catalogue — so the FE dropdown can
  // always represent the filter value.
  const rawLocality = nullifySentinel(rawFilters.locality) ?? null;
  const filters = {
    bhk: rawFilters.bhk ?? null,
    locality: canonicalizeLocality(rawLocality),
    city: nullifySentinel(rawFilters.city) ?? null,
    max_rent: rawFilters.max_rent ?? null,
  };

  const centroid = filters.locality
    ? await resolveLocalityCentroid(filters.city, filters.locality)
    : null;

  const strictRows = await searchPublicListings({
    city: filters.city || undefined,
    locality: filters.locality || undefined,
    bhk: filters.bhk ?? undefined,
    maxRent: filters.max_rent ?? undefined,
    centroid,
    radiusKm: centroid ? DEFAULT_RADIUS_KM : undefined,
    limit: STRICT_RESULT_LIMIT,
  });

  if (strictRows.length > 0) {
    const results = await hydrateListings(strictRows);
    // Strict pass uses centroid+radius, so rows can be from neighbouring
    // localities. Tell the summary builder to say "near" instead of "in"
    // when the returned listings aren't literally in the filter locality.
    const filterLocLower = filters.locality?.trim().toLowerCase() ?? null;
    const nearby =
      !!filterLocLower &&
      !results.every(
        (r) => (r.locality || "").trim().toLowerCase() === filterLocLower,
      );
    const summary = await buildSummary({
      user_query: query,
      filters,
      results_count: results.length,
      suggestions_count: 0,
      nearby,
    });
    return {
      filters,
      results,
      suggestions: [],
      suggestion_reason: null,
      summary,
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

  const suggestions = collected.length ? await hydrateListings(collected) : [];
  const summary = await buildSummary({
    user_query: query,
    filters,
    results_count: 0,
    suggestions_count: suggestions.length,
  });
  return {
    filters,
    results: [],
    suggestions,
    suggestion_reason: collected.length ? "no-exact-matches" : null,
    summary,
  };
}
