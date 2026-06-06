import Anthropic from "@anthropic-ai/sdk";
import { searchPublicListings } from "../../db/listings/listingDb.js";
import { listListingImages } from "../../db/listings/listingImageDb.js";
import { resolveLocalityCentroid } from "../_shared/geocodeService.js";
import { decoratePostedByMany } from "../_shared/postedBy.js";
import { getAllAmenitySlugs } from "../../db/amenities/amenityDb.js";
import { SEARCH_RADIUS_KM } from "./_searchConfig.js";
import {
  BANGALORE_LOCALITIES,
  canonicalizeLocality,
} from "./_bangaloreLocalities.js";
import { buildSummary } from "./_summary.js";

const AMENITY_SLUG_CACHE_TTL_MS = 60 * 1000;
let amenitySlugCache = { value: null, expiresAt: 0 };

async function getAmenitySlugsCached() {
  const now = Date.now();
  if (amenitySlugCache.value && now < amenitySlugCache.expiresAt) {
    return amenitySlugCache.value;
  }
  const slugs = await getAllAmenitySlugs();
  amenitySlugCache = {
    value: slugs,
    expiresAt: now + AMENITY_SLUG_CACHE_TTL_MS,
  };
  return slugs;
}

const DEFAULT_RADIUS_KM = SEARCH_RADIUS_KM;
const STRICT_RESULT_LIMIT = 50;
const SUGGESTION_CAP = 10;
const PRICE_RELAX_FACTOR = 1.2;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const FILTER_EXTRACTION_MAX_TOKENS = 256;

function buildListingFilterSchema(amenitySlugs) {
  return {
    type: "object",
    properties: {
      bhk: {
        type: ["integer", "null"],
        description: "Number of bedrooms (e.g. 2 for 2BHK)",
      },
      localities: {
        type: ["array", "null"],
        // Enum forces Claude to values the FE locality dropdown actually
        // contains, so search filters round-trip cleanly with the FE.
        items: { type: "string", enum: BANGALORE_LOCALITIES },
        description:
          "Bangalore locality names the user mentioned. MUST be values from the enum — use null if none are mentioned. Examples: 'HSR and Indiranagar' → ['HSR Layout', 'Indiranagar']; '2bhk in BTM' → ['BTM Layout'].",
      },
      city: {
        type: ["string", "null"],
        description: "City name (e.g. 'Bangalore')",
      },
      min_rent: {
        type: ["integer", "null"],
        description:
          "Minimum monthly rent in INR. Set when user mentions 'above 20k', 'at least 25000', 'starting from 30k'.",
      },
      max_rent: {
        type: ["integer", "null"],
        description: "Maximum monthly rent in INR",
      },
      amenities: {
        type: ["array", "null"],
        items: { type: "string", enum: amenitySlugs },
        description:
          "Amenity slugs the user mentioned. MUST be values from the enum — use null if none are mentioned. Examples of user phrases that map to slugs: 'gym' → 'gym', 'pool/swimming pool' → 'swimming_pool', 'parking' → 'covered_basement_parking' or whichever closest enum matches, 'CCTV' → 'cctv'.",
      },
    },
    required: [
      "bhk",
      "localities",
      "city",
      "min_rent",
      "max_rent",
      "amenities",
    ],
    additionalProperties: false,
  };
}

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
  const amenitySlugs = await getAmenitySlugsCached();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: FILTER_EXTRACTION_MAX_TOKENS,
    system: LISTING_SYSTEM_PROMPT,
    tools: [
      {
        name: "extract_filters",
        description: "Extract structured rental search filters",
        input_schema: buildListingFilterSchema(amenitySlugs),
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

  const parseAmount = (n, unit) => {
    if (unit === "k") return Math.round(parseFloat(n) * 1000);
    if (unit === "lakh" || unit === "lac" || unit === "l")
      return Math.round(parseFloat(n) * 100000);
    return Math.round(parseFloat(n));
  };

  let max_rent = null;
  const maxMatch =
    q.match(/under\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/below\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/<\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/);
  if (maxMatch) max_rent = parseAmount(maxMatch[1], maxMatch[2]);

  let min_rent = null;
  const minMatch =
    q.match(/above\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/over\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/at\s*least\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/>\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/);
  if (minMatch) min_rent = parseAmount(minMatch[1], minMatch[2]);

  const nearMatch = q.match(
    /(?:near|in|at)\s+([a-z][a-z\s]+?)(?:\s+under|\s+below|\s+above|\s+over|\s+<|\s*$)/,
  );
  // Regex fallback returns a single-element array (or null) to match the
  // Claude-path shape.
  const localities = nearMatch ? [nearMatch[1].trim()] : null;

  return {
    bhk,
    localities,
    city: null,
    min_rent,
    max_rent,
    amenities: null,
  };
}

const EMPTY_FILTERS = {
  bhk: null,
  localities: null,
  city: null,
  min_rent: null,
  max_rent: null,
  amenities: null,
};

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

function pickNonEmptyArray(explicitVal, nlVal) {
  const exp = Array.isArray(explicitVal) ? explicitVal.filter(Boolean) : null;
  if (exp && exp.length > 0) return exp;
  const nl = Array.isArray(nlVal) ? nlVal.filter(Boolean) : null;
  if (nl && nl.length > 0) return nl;
  return null;
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const key = v.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

// Hybrid input: either a free-text `query`, an explicit `filters` object, or
// both. Explicit user picks beat NL-extracted ones field-by-field (override
// semantics) — empty/null fields in `filters` mean "don't override".
//
// `filters.amenities` is the manual chip multi-select, treated as ALL-of
// (every picked amenity must be present). NL-derived amenities are passed as
// `amenitiesMode: "any"` to the DB layer, mirroring product intent that
// "gym and pool" in chat shouldn't exclude rentals that only have one.
export async function naturalLanguageSearch({ query, filters: bodyFilters }) {
  let nlFilters = { ...EMPTY_FILTERS };
  if (query && query.trim()) {
    try {
      nlFilters = process.env.ANTHROPIC_API_KEY
        ? await extractListingFiltersWithClaude(query)
        : extractListingFiltersWithRegex(query);
    } catch {
      nlFilters = { ...EMPTY_FILTERS };
    }
  }

  const explicit = bodyFilters || {};
  const pick = (k) =>
    explicit[k] !== undefined && explicit[k] !== null && explicit[k] !== ""
      ? explicit[k]
      : (nlFilters[k] ?? null);

  // Localities: explicit multi-select wins outright if non-empty; otherwise
  // fall through to NL-extracted list. Then canonicalize each through the
  // FE-mirrored vocabulary and dedupe.
  const pickedLocalities = pickNonEmptyArray(
    explicit.localities,
    nlFilters.localities,
  );
  const canonicalizedLocalities = pickedLocalities
    ? dedupe(
        pickedLocalities
          .map((l) => canonicalizeLocality(nullifySentinel(l) ?? null))
          .filter(Boolean),
      )
    : null;

  // Amenities: same precedence; explicit dropdown picks → ALL-of semantics,
  // NL-extracted → ANY-of (closer to user intent for "gym and pool").
  const explicitAmenities = Array.isArray(explicit.amenities)
    ? explicit.amenities.filter(Boolean)
    : null;
  const nlAmenities = Array.isArray(nlFilters.amenities)
    ? nlFilters.amenities.filter(Boolean)
    : null;
  const chosenAmenities =
    explicitAmenities && explicitAmenities.length > 0
      ? explicitAmenities
      : nlAmenities && nlAmenities.length > 0
        ? nlAmenities
        : null;
  const amenitiesMode =
    explicitAmenities && explicitAmenities.length > 0 ? "all" : "any";

  const filters = {
    bhk: pick("bhk") ?? null,
    localities:
      canonicalizedLocalities && canonicalizedLocalities.length > 0
        ? canonicalizedLocalities
        : null,
    city: nullifySentinel(pick("city")) ?? null,
    min_rent: pick("min_rent") ?? null,
    max_rent: pick("max_rent") ?? null,
    amenities: chosenAmenities,
  };

  // Resolve every selected locality's centroid in parallel. Entries stay
  // positionally aligned with `filters.localities` (a `null` means geocode
  // failed for that one — the DB layer falls back to a literal ILIKE).
  const centroids = filters.localities
    ? await Promise.all(
        filters.localities.map((l) => resolveLocalityCentroid(filters.city, l)),
      )
    : null;
  const anyCentroid = centroids && centroids.some(Boolean);

  const strictRows = await searchPublicListings({
    city: filters.city || undefined,
    localities: filters.localities ?? undefined,
    bhk: filters.bhk ?? undefined,
    minRent: filters.min_rent ?? undefined,
    maxRent: filters.max_rent ?? undefined,
    amenities: filters.amenities ?? undefined,
    amenitiesMode,
    centroids: centroids ?? undefined,
    radiusKm: anyCentroid ? DEFAULT_RADIUS_KM : undefined,
    limit: STRICT_RESULT_LIMIT,
  });

  if (strictRows.length > 0) {
    const results = await hydrateListings(strictRows);
    // Strict pass uses centroid+radius, so rows can be from neighbouring
    // localities. Tell the summary builder to say "near" instead of "in" when
    // any returned listing's locality isn't one of the filter localities.
    const filterLocSet = new Set(
      (filters.localities || []).map((l) => l.trim().toLowerCase()),
    );
    const nearby =
      filterLocSet.size > 0 &&
      !results.every((r) =>
        filterLocSet.has((r.locality || "").trim().toLowerCase()),
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

  // Rung 1: drop radius, keep literal localities/city if any
  if (collected.length < SUGGESTION_CAP) {
    const r1 = await searchPublicListings({
      city: filters.city || undefined,
      localities: filters.localities ?? undefined,
      bhk: filters.bhk ?? undefined,
      minRent: filters.min_rent ?? undefined,
      maxRent: filters.max_rent ?? undefined,
      amenities: filters.amenities ?? undefined,
      amenitiesMode,
      limit: SUGGESTION_CAP,
    });
    appendUniqueById(collected, r1, seen, SUGGESTION_CAP);
  }

  // Rung 2: relax max_rent by +20%
  if (collected.length < SUGGESTION_CAP && filters.max_rent != null) {
    const r2 = await searchPublicListings({
      city: filters.city || undefined,
      localities: filters.localities ?? undefined,
      bhk: filters.bhk ?? undefined,
      minRent: filters.min_rent ?? undefined,
      maxRent: Math.round(filters.max_rent * PRICE_RELAX_FACTOR),
      amenities: filters.amenities ?? undefined,
      amenitiesMode,
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
