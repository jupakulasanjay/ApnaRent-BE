// 5km is Bangalore-tuned: most popular localities sit 1–3km apart, so 5km
// captures the picked locality + 1–2 adjacent neighbourhoods without
// cross-quadrant leakage. When the strict pass finds nothing, the NL
// suggestion ladder drops the radius entirely rather than widening it.
export const SEARCH_RADIUS_KM = 5;
