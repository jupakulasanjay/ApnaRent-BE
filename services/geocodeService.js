import { getLocalityCentroid, upsertLocality } from "../db/localityDb.js"

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

// Resolves (city, locality) to a centroid. Cache hit returns immediately;
// cache miss calls Google Geocoding once and writes the result back.
// Returns null when no API key is configured, the API errors, or the
// geocoder returns no result — callers fall back to literal locality ILIKE.
export async function resolveLocalityCentroid(city, locality) {
  if (!locality) return null

  const cached = await getLocalityCentroid(city, locality)
  if (cached) return cached

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null

  const address = [locality, city, "India"].filter(Boolean).join(", ")
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${key}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[geocode] HTTP ${res.status} for "${address}"`)
      return null
    }
    const body = await res.json()
    if (body.status !== "OK" || !body.results?.length) {
      console.warn(`[geocode] ${body.status} for "${address}"`)
      return null
    }
    const loc = body.results[0].geometry?.location
    if (loc?.lat == null || loc?.lng == null) return null

    const centroid = { latitude: loc.lat, longitude: loc.lng }
    await upsertLocality({ city, locality, ...centroid })
    return centroid
  } catch (err) {
    console.warn(`[geocode] fetch failed for "${address}":`, err.message)
    return null
  }
}
