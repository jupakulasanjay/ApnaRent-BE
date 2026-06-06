// Composite SQL ranking score for the public list + search endpoints.
// Components (each 0..1):
//   • freshness    — recency decay; ~0.92 today, ~0.5 at ~30 days
//   • proximity    — only when a centroid is supplied; ~1.0 at 0m, ~0.5 at 1km
//   • completeness — fraction of {description, amenities, geo} that is set
//   • softMatch    — caller-supplied 0..1 SQL expression for soft preferences
//                    (e.g. BHK match in NL search where exclusion would
//                    surprise the user)
//
// Weight ladders are normalized so absent components don't penalize.
// Higher score → better; created_at DESC as a deterministic tie-breaker.

const FRESHNESS_HALF_LIFE_SECONDS = 2592000; // ~30 days
const PROXIMITY_HALF_LIFE_METERS = 1000;

export function buildRankExpr({ distanceExpr, softMatchExpr } = {}) {
  const freshness = `(1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - created_at)) / ${FRESHNESS_HALF_LIFE_SECONDS}.0))`;
  const completeness = `((
    (CASE WHEN description IS NOT NULL AND length(description) > 50 THEN 1 ELSE 0 END) +
    (CASE WHEN amenities IS NOT NULL AND array_length(amenities, 1) >= 3 THEN 1 ELSE 0 END) +
    (CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END)
  )::float8 / 3.0)`;

  let wProx, wFresh, wComp, wSoft;
  if (distanceExpr && softMatchExpr) {
    wProx = 0.35;
    wFresh = 0.2;
    wComp = 0.15;
    wSoft = 0.3;
  } else if (distanceExpr) {
    wProx = 0.5;
    wFresh = 0.3;
    wComp = 0.2;
    wSoft = 0;
  } else if (softMatchExpr) {
    wProx = 0;
    wFresh = 0.45;
    wComp = 0.25;
    wSoft = 0.3;
  } else {
    wProx = 0;
    wFresh = 0.6;
    wComp = 0.4;
    wSoft = 0;
  }

  const parts = [];
  if (distanceExpr)
    parts.push(
      `(1.0 / (1.0 + (${distanceExpr}) / ${PROXIMITY_HALF_LIFE_METERS}.0)) * ${wProx}`,
    );
  parts.push(`${freshness} * ${wFresh}`);
  parts.push(`${completeness} * ${wComp}`);
  if (softMatchExpr) parts.push(`(${softMatchExpr}) * ${wSoft}`);
  return `(${parts.join(" + ")})`;
}
