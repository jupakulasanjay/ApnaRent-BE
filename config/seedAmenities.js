import "dotenv/config";
import pool from "./db.js";
import { ICONS, getCatalogueForKind } from "./amenities.js";
import {
  upsertIcon,
  upsertAmenity,
} from "../db/amenities/amenityDb.js";

// One-shot seeder: pours the static catalogue in config/amenities.js into the
// `amenities` + `amenity_icons` tables. Idempotent — safe to re-run after the
// code-side catalogue is edited.

const KINDS = ["land", "plot", "apartment", "villa", "house", "commercial"];

async function seed() {
  let iconCount = 0;
  for (const [slug, svg] of Object.entries(ICONS)) {
    await upsertIcon(slug, svg);
    iconCount += 1;
  }

  let amenityCount = 0;
  for (const kind of KINDS) {
    const cat = getCatalogueForKind(kind);
    if (!cat) continue;
    let sortOrder = 0;
    for (const a of cat.amenities) {
      await upsertAmenity({
        slug: a.slug,
        label: a.label,
        icon: a.icon,
        category: a.category,
        kind,
        sort_order: sortOrder,
      });
      sortOrder += 1;
      amenityCount += 1;
    }
  }

  console.log(`✓ seeded ${iconCount} icons, ${amenityCount} amenity rows`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error("✗ amenity seed failed:", err.message);
      process.exit(1);
    });
}

export { seed };
