import Anthropic from "@anthropic-ai/sdk"
import { listPublicListings } from "../db/listingDb.js"
import { listListingImages } from "../db/listingImageDb.js"
import { listPublicProperties } from "../db/propertyDb.js"
import { listPropertyImages } from "../db/propertyImageDb.js"

// =============================================================
// LISTINGS (rental) search — unchanged public contract.
// Returns filters with nulls for keys the model didn't extract.
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

export async function naturalLanguageSearch(query) {
  const filters = process.env.ANTHROPIC_API_KEY
    ? await extractListingFiltersWithClaude(query)
    : extractListingFiltersWithRegex(query)

  const results = await listPublicListings({
    city:     filters.city || undefined,
    locality: filters.locality || undefined,
    bhk:      filters.bhk ?? undefined,
    maxRent:  filters.max_rent ?? undefined,
    limit:    50
  })
  const withImages = await Promise.all(
    results.map(async (l) => ({ ...l, images: await listListingImages(l.id) }))
  )
  return { filters, results: withImages }
}

// =============================================================
// PROPERTIES (sale) search — new.
// Returns filters WITHOUT null/undefined keys (FE renders each
// present key as a removable chip).
// =============================================================

const PROPERTY_TYPES = ["land", "plot", "apartment", "villa", "house", "commercial"]

// Known Indian metros for city-vs-locality disambiguation in the regex fallback.
// Claude handles this better; this list exists solely to keep the fallback usable.
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
    case "k":                         return Math.round(num * 1000)
    case "l": case "lac": case "lakh": return Math.round(num * 100000)
    case "cr": case "crore":           return Math.round(num * 10000000)
    default:                          return Math.round(num)
  }
}

function extractPropertyTypeWithRegex(q) {
  // Order matters — longer phrases first so "independent house" beats "house".
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

  // "between X [unit] and Y [unit]" (unit on either side)
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
  // Two patterns: "in X, Y" (city + locality) and "in X" (single place).
  const paired = q.match(/\bin\s+([a-z][a-z\s]*?)\s*,\s*([a-z][a-z\s]+?)(?=\s+(?:under|below|above|over|between|<|>|upto|up\s*to)|\s*$)/)
  if (paired) {
    const first = paired[1].trim()
    const second = paired[2].trim()
    // "Indiranagar, Bangalore" — the city-ish half goes to city.
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

// Remove keys whose value is null or undefined; also strip any key not in the
// schema allowlist (e.g. "bhk" if Claude hallucinates one).
function pruneFilters(raw) {
  const allowed = ["city", "locality", "property_type", "min_price", "max_price"]
  const out = {}
  for (const k of allowed) {
    if (raw[k] != null) out[k] = raw[k]
  }
  return out
}

export async function naturalLanguagePropertySearch(query) {
  let raw
  try {
    raw = process.env.ANTHROPIC_API_KEY
      ? await extractPropertyFiltersWithClaude(query)
      : extractPropertyFiltersWithRegex(query)
  } catch {
    // Never error the request on model failure — fall back to no filters.
    raw = {}
  }

  const filters = pruneFilters(raw)

  const results = await listPublicProperties({
    city:          filters.city,
    locality:      filters.locality,
    property_type: filters.property_type,
    min_price:     filters.min_price,
    max_price:     filters.max_price,
    limit:         50
  })
  const withImages = await Promise.all(
    results.map(async (p) => ({ ...p, images: await listPropertyImages(p.id) }))
  )
  return { filters, results: withImages }
}
