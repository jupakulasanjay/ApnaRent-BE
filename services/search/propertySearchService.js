import Anthropic from "@anthropic-ai/sdk";
import { searchPublicProperties } from "../../db/properties/propertyDb.js";
import { listPropertyImages } from "../../db/properties/propertyImageDb.js";
import { resolveLocalityCentroid } from "../_shared/geocodeService.js";
import { decoratePostedByMany } from "../_shared/postedBy.js";
import { getAllAmenitySlugs } from "../../db/amenities/amenityDb.js";
import { SEARCH_RADIUS_KM } from "./_searchConfig.js";
import {
  BANGALORE_LOCALITIES,
  canonicalizeLocality,
} from "./_bangaloreLocalities.js";
import { buildSummary } from "./_summary.js";

const PROPERTY_TYPES = ["residential", "plot", "commercial"];
const PROPERTY_FACINGS = [
  "north",
  "south",
  "east",
  "west",
  "north_east",
  "north_west",
  "south_east",
  "south_west",
];

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

function buildPropertyFilterSchema(amenitySlugs) {
  return {
    type: "object",
    properties: {
      property_type: {
        type: ["array", "null"],
        items: { type: "string", enum: PROPERTY_TYPES },
        description:
          "The kinds of property the user is after, collecting EVERY type mentioned. Each item MUST be one of: residential, plot, commercial. Examples: 'villa or plot' → ['residential', 'plot']; 'office space' → ['commercial']. A BHK/bedroom mention HINTS residential (add it), but never filter by the BHK number. Use null if the query says nothing about type.",
      },
      property_facing: {
        type: ["array", "null"],
        items: { type: "string", enum: PROPERTY_FACINGS },
        description:
          "Every compass direction the property should face, collected into an array. Map phrases like 'east-facing' → ['east'], 'north east facing' → ['north_east'], 'facing north or east' → ['north', 'east']. Use null if no facing is mentioned.",
      },
      min_area: {
        type: ["integer", "null"],
        description:
          "Minimum built-up/plot area in square feet, as a plain integer. Set for 'min 1500 sqft', 'at least 1200 sq ft', or the lower bound of a range like '1200-2000 sqft'.",
      },
      max_area: {
        type: ["integer", "null"],
        description:
          "Maximum area in square feet, as a plain integer. Set for 'under 2000 sqft' or the upper bound of a range like '1200-2000 sqft'.",
      },
      localities: {
        type: ["array", "null"],
        // Enum forces Claude to values the FE locality dropdown actually
        // contains, so search filters round-trip cleanly with the FE.
        items: { type: "string", enum: BANGALORE_LOCALITIES },
        description:
          "Bangalore locality names the user mentioned. MUST be values from the enum — use null if none are mentioned. Examples: 'HSR and Indiranagar' → ['HSR Layout', 'Indiranagar']; 'villa in BTM' → ['BTM Layout'].",
      },
      city: {
        type: ["string", "null"],
        description: "City name (e.g. 'Bangalore')",
      },
      min_price: {
        type: ["integer", "null"],
        description:
          "Minimum total sale price in INR. Set when user mentions 'above 50 lakh', 'at least 1 crore', 'starting from 75 lakh'.",
      },
      max_price: {
        type: ["integer", "null"],
        description: "Maximum total sale price in INR",
      },
      amenities: {
        type: ["array", "null"],
        items: { type: "string", enum: amenitySlugs },
        description:
          "Amenity slugs the user mentioned. MUST be values from the enum — use null if none are mentioned. Examples of user phrases that map to slugs: 'gym' → 'gym', 'pool/swimming pool' → 'swimming_pool', 'parking' → 'covered_basement_parking' or whichever closest enum matches, 'CCTV' → 'cctv'.",
      },
    },
    required: [
      "property_type",
      "property_facing",
      "localities",
      "city",
      "min_price",
      "max_price",
      "min_area",
      "max_area",
      "amenities",
    ],
    additionalProperties: false,
  };
}

const PROPERTY_SYSTEM_PROMPT = `You extract structured property-for-sale search filters from a user's natural-language query.
Return ONLY the filter object via the extract_filters tool. Use null for any field not mentioned.
Normalize price expressions: "60 lakh"/"60L" → 6000000, "1.2 crore"/"1.2cr" → 12000000, "50k" → 50000.
Area is in square feet as a plain integer: "1200 sqft" → 1200, "1200-2000 sq ft" → min_area 1200 / max_area 2000.

property_type — an ARRAY collecting EVERY type the user mentions (residential | plot | commercial), or null:
  - residential → "house", "home", "villa", "flat", "apartment", any "BHK"/"bedroom" mention, "duplex", "penthouse", "builder floor", "independent house", "row house". A bare BHK count ("3bhk", "2 bedroom") implies residential.
  - plot → "plot", "land", "site", "acre", "guntha", "open plot", "residential plot".
  - commercial → "office", "shop", "showroom", "warehouse", "commercial space", "retail", "godown", "co-working".
  - Collect all mentioned types, e.g. "villa or plot" → ["residential", "plot"].
  - IMPORTANT: a BHK number is NOT a filter. "3bhk" only hints property_type residential — never emit it as any kind of count filter.
  - If the query is ambiguous or says nothing about type, return null (search across all types).

property_facing — an ARRAY of compass directions mentioned, or null. "east-facing" → ["east"], "north east facing" → ["north_east"], "north or east facing" → ["north", "east"].

price — "under/below X" → max_price; "above/over X" → min_price; "X to Y"/"X-Y" → both.
area — "under 2000 sqft" → max_area; "min/at least 1500 sqft" → min_area; "1200-2000 sqft" → both.

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

async function extractPropertyFiltersWithClaude(query) {
  const amenitySlugs = await getAmenitySlugsCached();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: FILTER_EXTRACTION_MAX_TOKENS,
    system: PROPERTY_SYSTEM_PROMPT,
    tools: [
      {
        name: "extract_filters",
        description: "Extract structured property-for-sale search filters",
        input_schema: buildPropertyFilterSchema(amenitySlugs),
      },
    ],
    tool_choice: { type: "tool", name: "extract_filters" },
    messages: [{ role: "user", content: query }],
  });
  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse) throw new Error("Claude returned no tool use");
  return toolUse.input;
}

// Keyword → property_type[] for the no-API-key fallback. Collects EVERY type
// mentioned (so "villa or plot" → ["residential", "plot"]).
function detectPropertyTypes(q) {
  const types = [];
  if (
    /\b(house|home|villa|flat|apartment|duplex|penthouse|builder\s*floor|independent\s*house|row\s*house|bedroom)\b/.test(
      q,
    ) ||
    /\d+\s*bhk/.test(q)
  ) {
    types.push("residential");
  }
  if (/\b(plot|land|site|acre|guntha)\b/.test(q)) types.push("plot");
  if (
    /\b(office|shop|showroom|warehouse|commercial|retail|godown|co[\s-]?working)\b/.test(
      q,
    )
  ) {
    types.push("commercial");
  }
  return types.length ? types : null;
}

// Collect every compass direction mentioned (handles "north east"/"north-east"
// /"northeast" → north_east) for the no-API-key fallback.
function detectFacings(q) {
  const out = [];
  const add = (f) => {
    if (!out.includes(f)) out.push(f);
  };
  const compound = [
    [/north[\s-]?east/, "north_east"],
    [/north[\s-]?west/, "north_west"],
    [/south[\s-]?east/, "south_east"],
    [/south[\s-]?west/, "south_west"],
  ];
  let stripped = q;
  for (const [re, val] of compound) {
    if (re.test(stripped)) {
      add(val);
      stripped = stripped.replace(re, " ");
    }
  }
  for (const dir of ["north", "south", "east", "west"]) {
    if (new RegExp(`\\b${dir}\\b`).test(stripped)) add(dir);
  }
  return out.length ? out : null;
}

function extractPropertyFiltersWithRegex(query) {
  const q = query.toLowerCase();

  const property_type = detectPropertyTypes(q);
  const property_facing = detectFacings(q);

  // Area in sqft: a "1200-2000 sqft" range, or single "under/min N sqft".
  let min_area = null;
  let max_area = null;
  const areaRange = q.match(
    /(\d{3,6})\s*(?:-|to|–)\s*(\d{3,6})\s*(?:sq\.?\s*ft|sqft|sft|square\s*feet)/,
  );
  if (areaRange) {
    min_area = parseInt(areaRange[1], 10);
    max_area = parseInt(areaRange[2], 10);
  } else {
    const maxArea = q.match(
      /(?:under|below|upto|up to|max)\s*(\d{3,6})\s*(?:sq\.?\s*ft|sqft|sft|square\s*feet)/,
    );
    if (maxArea) max_area = parseInt(maxArea[1], 10);
    const minArea = q.match(
      /(?:min|minimum|at\s*least|over|above)\s*(\d{3,6})\s*(?:sq\.?\s*ft|sqft|sft|square\s*feet)/,
    );
    if (minArea) min_area = parseInt(minArea[1], 10);
  }

  const parseAmount = (n, unit) => {
    if (unit === "k") return Math.round(parseFloat(n) * 1000);
    if (unit === "lakh" || unit === "lac" || unit === "l")
      return Math.round(parseFloat(n) * 100000);
    if (unit === "crore" || unit === "cr")
      return Math.round(parseFloat(n) * 10000000);
    return Math.round(parseFloat(n));
  };

  let max_price = null;
  const maxMatch =
    q.match(/under\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l|crore|cr)?/) ||
    q.match(/below\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l|crore|cr)?/) ||
    q.match(/<\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l|crore|cr)?/);
  if (maxMatch) max_price = parseAmount(maxMatch[1], maxMatch[2]);

  let min_price = null;
  const minMatch =
    q.match(/above\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l|crore|cr)?/) ||
    q.match(/over\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l|crore|cr)?/) ||
    q.match(
      /at\s*least\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l|crore|cr)?/,
    ) ||
    q.match(/>\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l|crore|cr)?/);
  if (minMatch) min_price = parseAmount(minMatch[1], minMatch[2]);

  const nearMatch = q.match(
    /(?:near|in|at)\s+([a-z][a-z\s]+?)(?:\s+under|\s+below|\s+above|\s+over|\s+<|\s*$)/,
  );
  // Regex fallback returns a single-element array (or null) to match the
  // Claude-path shape.
  const localities = nearMatch ? [nearMatch[1].trim()] : null;

  return {
    property_type,
    property_facing,
    localities,
    city: null,
    min_price,
    max_price,
    min_area,
    max_area,
    amenities: null,
  };
}

const EMPTY_FILTERS = {
  property_type: null,
  property_facing: null,
  localities: null,
  city: null,
  min_price: null,
  max_price: null,
  min_area: null,
  max_area: null,
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

// Coerce an incoming value (array, single string, or junk) to a deduped array
// of values from `allowed`, or null when nothing valid remains.
function normalizeEnumArray(v, allowed) {
  const arr = Array.isArray(v) ? v : v != null ? [v] : [];
  const out = [];
  for (const item of arr) {
    const s = nullifySentinel(item);
    if (allowed.includes(s) && !out.includes(s)) out.push(s);
  }
  return out.length ? out : null;
}

async function hydrateProperties(rows) {
  const withImages = await Promise.all(
    rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) })),
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
// `filters.property_type` (residential | plot | commercial) is a HARD filter.
// When both an explicit and an NL-implied type are present, explicit wins.
//
// `filters.amenities` is the manual chip multi-select, treated as ALL-of
// (every picked amenity must be present). NL-derived amenities are passed as
// `amenitiesMode: "any"` to the DB layer.
export async function naturalLanguagePropertySearch({
  query,
  filters: bodyFilters,
}) {
  let nlFilters = { ...EMPTY_FILTERS };
  if (query && query.trim()) {
    try {
      nlFilters = process.env.ANTHROPIC_API_KEY
        ? await extractPropertyFiltersWithClaude(query)
        : extractPropertyFiltersWithRegex(query);
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

  // property_type & property_facing: arrays (multi-select, OR match). Explicit
  // picks win over NL-implied; both validated/deduped against their enums.
  const propertyTypes =
    normalizeEnumArray(explicit.property_type, PROPERTY_TYPES) ??
    normalizeEnumArray(nlFilters.property_type, PROPERTY_TYPES);
  const propertyFacings =
    normalizeEnumArray(explicit.property_facing, PROPERTY_FACINGS) ??
    normalizeEnumArray(nlFilters.property_facing, PROPERTY_FACINGS);

  const filters = {
    property_type: propertyTypes,
    property_facing: propertyFacings,
    localities:
      canonicalizedLocalities && canonicalizedLocalities.length > 0
        ? canonicalizedLocalities
        : null,
    city: nullifySentinel(pick("city")) ?? null,
    min_price: pick("min_price") ?? null,
    max_price: pick("max_price") ?? null,
    min_area: pick("min_area") ?? null,
    max_area: pick("max_area") ?? null,
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

  const strictRows = await searchPublicProperties({
    city: filters.city || undefined,
    localities: filters.localities ?? undefined,
    propertyTypes: filters.property_type ?? undefined,
    propertyFacings: filters.property_facing ?? undefined,
    minArea: filters.min_area ?? undefined,
    maxArea: filters.max_area ?? undefined,
    minPrice: filters.min_price ?? undefined,
    maxPrice: filters.max_price ?? undefined,
    amenities: filters.amenities ?? undefined,
    amenitiesMode,
    centroids: centroids ?? undefined,
    radiusKm: anyCentroid ? DEFAULT_RADIUS_KM : undefined,
    limit: STRICT_RESULT_LIMIT,
  });

  if (strictRows.length > 0) {
    const results = await hydrateProperties(strictRows);
    // Strict pass uses centroid+radius, so rows can be from neighbouring
    // localities. Tell the summary builder to say "near" instead of "in" when
    // any returned property's locality isn't one of the filter localities.
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
      domain: "properties",
      propertyTypes: filters.property_type,
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
  // property_type stays a hard constraint through the ladder.
  const seen = new Set();
  const collected = [];

  // Rung 1: drop radius, keep literal localities/city if any
  if (collected.length < SUGGESTION_CAP) {
    const r1 = await searchPublicProperties({
      city: filters.city || undefined,
      localities: filters.localities ?? undefined,
      propertyTypes: filters.property_type ?? undefined,
      minPrice: filters.min_price ?? undefined,
      maxPrice: filters.max_price ?? undefined,
      amenities: filters.amenities ?? undefined,
      amenitiesMode,
      limit: SUGGESTION_CAP,
    });
    appendUniqueById(collected, r1, seen, SUGGESTION_CAP);
  }

  // Rung 2: relax max_price by +20%
  if (collected.length < SUGGESTION_CAP && filters.max_price != null) {
    const r2 = await searchPublicProperties({
      city: filters.city || undefined,
      localities: filters.localities ?? undefined,
      propertyTypes: filters.property_type ?? undefined,
      minPrice: filters.min_price ?? undefined,
      maxPrice: Math.round(filters.max_price * PRICE_RELAX_FACTOR),
      amenities: filters.amenities ?? undefined,
      amenitiesMode,
      limit: SUGGESTION_CAP,
    });
    appendUniqueById(collected, r2, seen, SUGGESTION_CAP);
  }

  const suggestions = collected.length
    ? await hydrateProperties(collected)
    : [];
  const summary = await buildSummary({
    user_query: query,
    filters,
    results_count: 0,
    suggestions_count: suggestions.length,
    domain: "properties",
    propertyTypes: filters.property_type,
  });
  return {
    filters,
    results: [],
    suggestions,
    suggestion_reason: collected.length ? "no-exact-matches" : null,
    summary,
  };
}
