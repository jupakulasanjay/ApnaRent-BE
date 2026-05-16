import Anthropic from "@anthropic-ai/sdk"
import { searchPublicListings } from "../db/listingDb.js"
import { listListingImages } from "../db/listingImageDb.js"
import { searchPublicProperties } from "../db/propertyDb.js"
import { listPropertyImages } from "../db/propertyImageDb.js"
import { resolveLocalityCentroid } from "./geocodeService.js"
import { decoratePostedByMany } from "./postedBy.js"

const DEFAULT_RADIUS_KM = Number(process.env.SEARCH_RADIUS_KM) || 15
const WIDE_RADIUS_KM = 30
const SUGGESTION_CAP = 10
const PRICE_RELAX_FACTOR = 1.2

// =============================================================
// LISTINGS (rental) — filter extraction
// =============================================================

const LISTING_FILTER_SCHEMA = {
  type: "object",
  properties: {
    bhk:      { type: ["integer", "null"], description: "Number of bedrooms (e.g. 2 for 2BHK)" },
    locality: { type: ["string", "null"],  description: "Neighborhood or area name (e.g. 'Whitefield')" },
    city:     { type: ["string", "null"],  description: "City name (e.g. 'Bangalore')" },
    max_rent: { type: ["integer", "null"], description: "Maximum monthly rent in INR" }
  },
  required: ["bhk", "locality", "city", "max_rent"],
  additionalProperties: false
}

const LISTING_SYSTEM_PROMPT = `You extract structured rental-search filters from a user's natural-language query.
Return ONLY the filter object via the extract_filters tool. Use null for any field not mentioned.
Normalize rent expressions: "60k" → 60000, "1.2 lakh" → 120000.`

async function extractListingFiltersWithClaude(query) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: LISTING_SYSTEM_PROMPT,
    tools: [{
      name: "extract_filters",
      description: "Extract structured rental search filters",
      input_schema: LISTING_FILTER_SCHEMA
    }],
    tool_choice: { type: "tool", name: "extract_filters" },
    messages: [{ role: "user", content: query }]
  })
  const toolUse = response.content.find((c) => c.type === "tool_use")
  if (!toolUse) throw new Error("Claude returned no tool use")
  return toolUse.input
}

function extractListingFiltersWithRegex(query) {
  const q = query.toLowerCase()

  const bhkMatch = q.match(/(\d+)\s*bhk/)
  const bhk = bhkMatch ? parseInt(bhkMatch[1], 10) : null

  const rentMatch =
    q.match(/under\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/below\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/) ||
    q.match(/<\s*(?:₹|rs\.?|inr)?\s*([\d.]+)\s*(k|lakh|lac|l)?/)
  let max_rent = null
  if (rentMatch) {
    const n = parseFloat(rentMatch[1])
    const unit = rentMatch[2]
    if (unit === "k") max_rent = Math.round(n * 1000)
    else if (unit === "lakh" || unit === "lac" || unit === "l") max_rent = Math.round(n * 100000)
    else max_rent = Math.round(n)
  }

  const nearMatch = q.match(/(?:near|in|at)\s+([a-z][a-z\s]+?)(?:\s+under|\s+below|\s+<|\s*$)/)
  const locality = nearMatch ? nearMatch[1].trim() : null

  return { bhk, locality, city: null, max_rent }
}

// =============================================================
// PROPERTIES (sale) — filter extraction
// =============================================================

const PROPERTY_TYPES = ["land", "plot", "apartment", "villa", "house", "commercial"]

const KNOWN_CITIES = new Set([
  "bangalore", "bengaluru", "mumbai", "delhi", "new delhi", "chennai",
  "hyderabad", "pune", "kolkata", "ahmedabad", "jaipur", "kochi", "noida", "gurgaon", "gurugram"
])

const PROPERTY_FILTER_SCHEMA = {
  type: "object",
  properties: {
    city:          { type: ["string", "null"],  description: "City name (e.g. 'Bangalore')" },
    locality:      { type: ["string", "null"],  description: "Neighborhood/area (e.g. 'Whitefield', 'Koramangala')" },
    property_type: { type: ["string", "null"],  enum: [...PROPERTY_TYPES, null],
                     description: "Normalized property type" },
    min_price:     { type: ["integer", "null"], description: "Minimum sale price in INR" },
    max_price:     { type: ["integer", "null"], description: "Maximum sale price in INR" }
  },
  required: ["city", "locality", "property_type", "min_price", "max_price"],
  additionalProperties: false
}

const PROPERTY_SYSTEM_PROMPT = `You extract structured property-for-sale search filters from a user's natural-language query.
Return ONLY the filter object via the extract_filters tool. Use null for any field not present in the query.

Price parsing — Indian shorthand:
  "80L" / "80 lakh" / "80 lac" → 8000000
  "1.5Cr" / "1.5 crore"        → 15000000
  "50k"                        → 50000
  "under 80L"                  → max_price = 8000000
  "above 1Cr" / "over 1Cr"     → min_price = 10000000
  "between 50L and 80L"        → min_price = 5000000, max_price = 8000000

Property type synonyms (normalize to these exact values):
  "apartment" / "flat"                  → "apartment"
  "villa"                               → "villa"
  "house" / "independent house" /
    "bungalow"                          → "house"
  "plot" / "site"                       → "plot"
  "land" / "acreage"                    → "land"
  "commercial" / "shop" / "office" /
    "commercial space"                  → "commercial"

Location:
  - Distinguish city from locality. Well-known cities (Bangalore, Mumbai, Delhi, Chennai, Hyderabad, Pune, Kolkata, Noida, Gurgaon) are city.
  - Neighborhoods (Whitefield, Koramangala, Indiranagar, Bandra, etc.) are locality.
  - "Indiranagar, Bangalore" → both city and locality set.
  - When the phrase is ambiguous and only one place is named, prefer city.

Ignore bedroom/rent/furnishing fields — those are rental concepts, not relevant here.
If the query is off-topic or unintelligible, return all nulls.`

async function extractPropertyFiltersWithClaude(query) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: PROPERTY_SYSTEM_PROMPT,
    tools: [{
      name: "extract_filters",
      description: "Extract structured property search filters",
      input_schema: PROPERTY_FILTER_SCHEMA
    }],
    tool_choice: { type: "tool", name: "extract_filters" },
    messages: [{ role: "user", content: query }]
  })
  const toolUse = response.content.find((c) => c.type === "tool_use")
  if (!toolUse) throw new Error("Claude returned no tool use")
  return toolUse.input
}

function toRupees(n, unit) {
  const num = parseFloat(n)
  if (!Number.isFinite(num)) return null
  switch (unit) {
    case "k":                          return Math.round(num * 1000)
    case "l": case "lac": case "lakh": return Math.round(num * 100000)
    case "cr": case "crore":           return Math.round(num * 10000000)
    default:                           return Math.round(num)
  }
}

function extractPropertyTypeWithRegex(q) {
  if (/\bcommercial(?:\s+space)?\b|\bshop\b|\boffice\b/.test(q)) return "commercial"
  if (/\bindependent\s+house\b|\bbungalow\b/.test(q))            return "house"
  if (/\bvilla\b/.test(q))                                        return "villa"
  if (/\bapartment\b|\bflat\b/.test(q))                           return "apartment"
  if (/\bhouse\b/.test(q))                                        return "house"
  if (/\bplot\b|\bsite\b/.test(q))                                return "plot"
  if (/\bland\b|\bacreage\b/.test(q))                             return "land"
  return null
}

function extractPropertyPriceWithRegex(q) {
  const unit = "(k|lakh|lac|l|cr|crore)"
  let min_price = null
  let max_price = null

  const between = q.match(new RegExp(`between\\s*([\\d.]+)\\s*${unit}?\\s*(?:and|to|-)\\s*([\\d.]+)\\s*${unit}?`))
  if (between) {
    const loUnit = between[2] || between[4] || ""
    const hiUnit = between[4] || between[2] || ""
    min_price = toRupees(between[1], loUnit.toLowerCase())
    max_price = toRupees(between[3], hiUnit.toLowerCase())
    return { min_price, max_price }
  }

  const maxMatch = q.match(new RegExp(`(?:under|below|upto|up\\s*to|<)\\s*(?:₹|rs\\.?|inr)?\\s*([\\d.]+)\\s*${unit}?`))
  if (maxMatch) max_price = toRupees(maxMatch[1], (maxMatch[2] || "").toLowerCase())

  const minMatch = q.match(new RegExp(`(?:above|over|>)\\s*(?:₹|rs\\.?|inr)?\\s*([\\d.]+)\\s*${unit}?`))
  if (minMatch) min_price = toRupees(minMatch[1], (minMatch[2] || "").toLowerCase())

  return { min_price, max_price }
}

function extractPropertyLocationWithRegex(q) {
  const paired = q.match(/\bin\s+([a-z][a-z\s]*?)\s*,\s*([a-z][a-z\s]+?)(?=\s+(?:under|below|above|over|between|<|>|upto|up\s*to)|\s*$)/)
  if (paired) {
    const first = paired[1].trim()
    const second = paired[2].trim()
    if (KNOWN_CITIES.has(second)) return { city: titleCase(second), locality: titleCase(first) }
    if (KNOWN_CITIES.has(first))  return { city: titleCase(first),  locality: titleCase(second) }
    return { city: null, locality: titleCase(first) }
  }

  const single = q.match(/\b(?:in|at|near)\s+([a-z][a-z\s]+?)(?=\s+(?:under|below|above|over|between|<|>|upto|up\s*to)|\s*$)/)
  if (single) {
    const name = single[1].trim()
    if (KNOWN_CITIES.has(name)) return { city: titleCase(name), locality: null }
    return { city: null, locality: titleCase(name) }
  }

  return { city: null, locality: null }
}

function titleCase(s) {
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function extractPropertyFiltersWithRegex(query) {
  const q = query.toLowerCase()
  const property_type = extractPropertyTypeWithRegex(q)
  const { min_price, max_price } = extractPropertyPriceWithRegex(q)
  const { city, locality } = extractPropertyLocationWithRegex(q)
  return { city, locality, property_type, min_price, max_price }
}

// LLMs occasionally return string sentinels like "<UNKNOWN>" or "" instead
// of null when a field isn't present. Coerce these to null before they hit
// the DB layer — otherwise `city ILIKE '<UNKNOWN>'` filters everything out.
const NULLISH_STRINGS = new Set(["", "unknown", "<unknown>", "n/a", "na", "none", "null"])
function nullifySentinel(v) {
  if (typeof v !== "string") return v
  const trimmed = v.trim()
  return NULLISH_STRINGS.has(trimmed.toLowerCase()) ? null : trimmed
}

function prunePropertyFilters(raw) {
  const allowed = ["city", "locality", "property_type", "min_price", "max_price"]
  const out = {}
  for (const k of allowed) {
    const v = nullifySentinel(raw[k])
    if (v != null) out[k] = v
  }
  return out
}

// =============================================================
// Shared helpers
// =============================================================

async function hydrateListings(rows) {
  const withImages = await Promise.all(
    rows.map(async (l) => ({ ...l, images: await listListingImages(l.id) }))
  )
  return decoratePostedByMany(withImages)
}

async function hydrateProperties(rows) {
  const withImages = await Promise.all(
    rows.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) }))
  )
  return decoratePostedByMany(withImages)
}

// Top up `target` from `candidates`, skipping ids already in `excludeIds`,
// stopping at `cap`. Mutates target + excludeIds in place.
function appendUniqueById(target, candidates, excludeIds, cap) {
  for (const row of candidates) {
    if (target.length >= cap) break
    if (excludeIds.has(row.id)) continue
    target.push(row)
    excludeIds.add(row.id)
  }
}

// =============================================================
// LISTINGS — full search with geo + suggestion ladder
// =============================================================

export async function naturalLanguageSearch(query) {
  let rawFilters
  try {
    rawFilters = process.env.ANTHROPIC_API_KEY
      ? await extractListingFiltersWithClaude(query)
      : extractListingFiltersWithRegex(query)
  } catch {
    rawFilters = { bhk: null, locality: null, city: null, max_rent: null }
  }

  const filters = {
    bhk:      rawFilters.bhk ?? null,
    locality: nullifySentinel(rawFilters.locality) ?? null,
    city:     nullifySentinel(rawFilters.city) ?? null,
    max_rent: rawFilters.max_rent ?? null
  }

  const centroid = filters.locality
    ? await resolveLocalityCentroid(filters.city, filters.locality)
    : null

  // Strict pass — DEFAULT_RADIUS_KM around centroid when resolved,
  // literal locality/city ILIKE otherwise.
  const strictRows = await searchPublicListings({
    city:     filters.city || undefined,
    locality: filters.locality || undefined,
    bhk:      filters.bhk ?? undefined,
    maxRent:  filters.max_rent ?? undefined,
    centroid,
    radiusKm: centroid ? DEFAULT_RADIUS_KM : undefined,
    limit:    50
  })

  if (strictRows.length > 0) {
    return {
      filters,
      results: await hydrateListings(strictRows),
      suggestions: [],
      suggestion_reason: null
    }
  }

  // Suggestion ladder. Each rung tops up from where the previous stopped.
  const seen = new Set()
  const collected = []

  // Rung 1: widen radius to WIDE_RADIUS_KM (requires a centroid)
  if (centroid) {
    const r1 = await searchPublicListings({
      city: filters.city || undefined,
      locality: filters.locality || undefined,
      bhk: filters.bhk ?? undefined,
      maxRent: filters.max_rent ?? undefined,
      centroid, radiusKm: WIDE_RADIUS_KM, limit: SUGGESTION_CAP
    })
    appendUniqueById(collected, r1, seen, SUGGESTION_CAP)
  }

  // Rung 2: drop radius, keep literal locality/city if any
  if (collected.length < SUGGESTION_CAP) {
    const r2 = await searchPublicListings({
      city: filters.city || undefined,
      locality: filters.locality || undefined,
      bhk: filters.bhk ?? undefined,
      maxRent: filters.max_rent ?? undefined,
      limit: SUGGESTION_CAP
    })
    appendUniqueById(collected, r2, seen, SUGGESTION_CAP)
  }

  // Rung 3: relax max_rent by +20%
  if (collected.length < SUGGESTION_CAP && filters.max_rent != null) {
    const r3 = await searchPublicListings({
      city: filters.city || undefined,
      locality: filters.locality || undefined,
      bhk: filters.bhk ?? undefined,
      maxRent: Math.round(filters.max_rent * PRICE_RELAX_FACTOR),
      limit: SUGGESTION_CAP
    })
    appendUniqueById(collected, r3, seen, SUGGESTION_CAP)
  }

  // Rung 4: drop BHK (keep relaxed price)
  if (collected.length < SUGGESTION_CAP && filters.bhk != null) {
    const r4 = await searchPublicListings({
      city: filters.city || undefined,
      locality: filters.locality || undefined,
      maxRent: filters.max_rent != null
        ? Math.round(filters.max_rent * PRICE_RELAX_FACTOR)
        : undefined,
      limit: SUGGESTION_CAP
    })
    appendUniqueById(collected, r4, seen, SUGGESTION_CAP)
  }

  return {
    filters,
    results: [],
    suggestions: collected.length ? await hydrateListings(collected) : [],
    suggestion_reason: collected.length ? "no-exact-matches" : null
  }
}

// =============================================================
// PROPERTIES — full search with geo + suggestion ladder
// =============================================================

export async function naturalLanguagePropertySearch(query) {
  let raw
  try {
    raw = process.env.ANTHROPIC_API_KEY
      ? await extractPropertyFiltersWithClaude(query)
      : extractPropertyFiltersWithRegex(query)
  } catch {
    raw = {}
  }

  const filters = prunePropertyFilters(raw)

  const centroid = filters.locality
    ? await resolveLocalityCentroid(filters.city, filters.locality)
    : null

  const strictRows = await searchPublicProperties({
    city:          filters.city,
    locality:      filters.locality,
    property_type: filters.property_type,
    min_price:     filters.min_price,
    max_price:     filters.max_price,
    centroid,
    radiusKm:      centroid ? DEFAULT_RADIUS_KM : undefined,
    limit:         50
  })

  if (strictRows.length > 0) {
    return {
      filters,
      results: await hydrateProperties(strictRows),
      suggestions: [],
      suggestion_reason: null
    }
  }

  const seen = new Set()
  const collected = []

  // Rung 1: widen radius
  if (centroid) {
    const r1 = await searchPublicProperties({
      ...filters, centroid, radiusKm: WIDE_RADIUS_KM, limit: SUGGESTION_CAP
    })
    appendUniqueById(collected, r1, seen, SUGGESTION_CAP)
  }

  // Rung 2: drop radius
  if (collected.length < SUGGESTION_CAP) {
    const r2 = await searchPublicProperties({ ...filters, limit: SUGGESTION_CAP })
    appendUniqueById(collected, r2, seen, SUGGESTION_CAP)
  }

  // Rung 3: relax price by ±20% — max bumped up, min bumped down.
  if (collected.length < SUGGESTION_CAP && (filters.max_price != null || filters.min_price != null)) {
    const r3 = await searchPublicProperties({
      city:          filters.city,
      locality:      filters.locality,
      property_type: filters.property_type,
      max_price:     filters.max_price != null
        ? Math.round(filters.max_price * PRICE_RELAX_FACTOR)
        : undefined,
      min_price:     filters.min_price != null
        ? Math.round(filters.min_price * (2 - PRICE_RELAX_FACTOR))
        : undefined,
      limit: SUGGESTION_CAP
    })
    appendUniqueById(collected, r3, seen, SUGGESTION_CAP)
  }

  // Rung 4: drop property_type (keep ±20% price)
  if (collected.length < SUGGESTION_CAP && filters.property_type) {
    const r4 = await searchPublicProperties({
      city:      filters.city,
      locality:  filters.locality,
      max_price: filters.max_price != null
        ? Math.round(filters.max_price * PRICE_RELAX_FACTOR)
        : undefined,
      min_price: filters.min_price != null
        ? Math.round(filters.min_price * (2 - PRICE_RELAX_FACTOR))
        : undefined,
      limit: SUGGESTION_CAP
    })
    appendUniqueById(collected, r4, seen, SUGGESTION_CAP)
  }

  return {
    filters,
    results: [],
    suggestions: collected.length ? await hydrateProperties(collected) : [],
    suggestion_reason: collected.length ? "no-exact-matches" : null
  }
}
