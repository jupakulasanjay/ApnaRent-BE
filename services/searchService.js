import Anthropic from "@anthropic-ai/sdk"
import { listPublicListings } from "../db/listingDb.js"
import { listListingImages } from "../db/listingImageDb.js"

const FILTER_SCHEMA = {
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

const SYSTEM_PROMPT = `You extract structured rental-search filters from a user's natural-language query.
Return ONLY the filter object via the extract_filters tool. Use null for any field not mentioned.
Normalize rent expressions: "60k" → 60000, "1.2 lakh" → 120000.`

async function extractWithClaude(query) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    tools: [{
      name: "extract_filters",
      description: "Extract structured rental search filters",
      input_schema: FILTER_SCHEMA
    }],
    tool_choice: { type: "tool", name: "extract_filters" },
    messages: [{ role: "user", content: query }]
  })

  const toolUse = response.content.find((c) => c.type === "tool_use")
  if (!toolUse) throw new Error("Claude returned no tool use")
  return toolUse.input
}

// Fallback regex extractor when no API key is available.
function extractWithRegex(query) {
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
    ? await extractWithClaude(query)
    : extractWithRegex(query)

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
