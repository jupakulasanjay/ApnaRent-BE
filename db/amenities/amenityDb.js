import pool from "../../config/db.js";

export async function getSupportedKinds() {
  const { rows } = await pool.query(
    `SELECT DISTINCT kind FROM amenities ORDER BY kind`,
  );
  return rows.map((r) => r.kind);
}

// Returns the amenities catalogue for a single kind, plus the inline SVGs for
// every icon it references. Shape mirrors the legacy config/amenities.js
// helper so the controller payload stays unchanged for the FE.
export async function getCatalogueForKind(kind) {
  const { rows } = await pool.query(
    `SELECT slug, label, icon, category
       FROM amenities
      WHERE kind = $1
      ORDER BY sort_order, id`,
    [kind],
  );
  if (rows.length === 0) return null;

  const iconSlugs = [...new Set(rows.map((r) => r.icon))];
  const icons = await fetchIcons(iconSlugs);
  return { kind, amenities: rows, icons };
}

// Cross-kind union for the search filter dropdown — listings doesn't have a
// `kind` column, so the filter UI needs a single flat list deduped by slug.
export async function getAllAmenities() {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (slug) slug, label, icon, category, kind
       FROM amenities
      ORDER BY slug, sort_order, id`,
  );
  const iconSlugs = [...new Set(rows.map((r) => r.icon))];
  const icons = await fetchIcons(iconSlugs);
  return { amenities: rows, icons };
}

// Lightweight slug list — used by the NL filter extractor to constrain Claude's
// enum so it can't invent variants like "swimming-pool" vs "swimming_pool".
export async function getAllAmenitySlugs() {
  const { rows } = await pool.query(
    `SELECT DISTINCT slug FROM amenities ORDER BY slug`,
  );
  return rows.map((r) => r.slug);
}

async function fetchIcons(slugs) {
  if (slugs.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT slug, svg FROM amenity_icons WHERE slug = ANY($1::text[])`,
    [slugs],
  );
  return Object.fromEntries(rows.map((r) => [r.slug, r.svg]));
}

export async function upsertIcon(slug, svg) {
  await pool.query(
    `INSERT INTO amenity_icons (slug, svg) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET svg = EXCLUDED.svg`,
    [slug, svg],
  );
}

export async function upsertAmenity({
  slug,
  label,
  icon,
  category,
  kind,
  sort_order,
}) {
  await pool.query(
    `INSERT INTO amenities (slug, label, icon, category, kind, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (slug, kind) DO UPDATE
       SET label = EXCLUDED.label,
           icon = EXCLUDED.icon,
           category = EXCLUDED.category,
           sort_order = EXCLUDED.sort_order`,
    [slug, label, icon, category, kind, sort_order],
  );
}
