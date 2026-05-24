// Single source of truth for the search radius. Both the structured browse
// path (GET /api/rentals) and the NL-search path (POST /api/search/rentals)
// read from here so behaviour stays consistent.
//
// 5km is Bangalore-tuned: most popular localities sit 1–3km apart, so
// 5km captures the picked locality + 1–2 adjacent neighbourhoods without
// cross-quadrant leakage. When the strict pass finds nothing, the NL
// suggestion ladder drops the radius filter entirely rather than widening
// it — keeping a single, predictable radius everywhere it applies.
export const SEARCH_RADIUS_KM = 5;
