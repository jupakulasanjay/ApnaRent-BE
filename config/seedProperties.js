import "dotenv/config";
import pool from "./db.js";

// Dummy-data seeder for the `properties` + `property_images` tables.
//
//   node config/seedProperties.js            # append ~50 properties
//   node config/seedProperties.js --count=80 # append N properties
//   node config/seedProperties.js --reset    # delete ALL properties first
//
// Properties mirror the rentals model with `rent`→`price` and `bhk`→
// `property_type` (residential | plot | commercial). Owned by the first
// 'owner' user (falls back to the first 'admin'). Most rows are 'active' so
// they surface on the public + search endpoints; a handful are draft / pending
// / rejected for dashboard variety.

const args = process.argv.slice(2);
const RESET = args.includes("--reset");
const countArg = args.find((a) => a.startsWith("--count="));
const COUNT = countArg ? Math.max(1, parseInt(countArg.split("=")[1], 10)) : 50;

// Deterministic PRNG so re-runs produce the same dataset (mulberry32).
let _s = 0x9e3779b9;
function rng() {
  _s |= 0;
  _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1));
const roundTo = (n, step) => Math.round(n / step) * step;
function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

// Well-known Bangalore localities with approximate centroids.
const LOCALITIES = [
  { locality: "Whitefield", lat: 12.9698, lng: 77.75 },
  { locality: "HSR Layout", lat: 12.9116, lng: 77.6389 },
  { locality: "Koramangala", lat: 12.9352, lng: 77.6245 },
  { locality: "Indiranagar", lat: 12.9784, lng: 77.6408 },
  { locality: "Electronic City", lat: 12.8452, lng: 77.6602 },
  { locality: "Marathahalli", lat: 12.9569, lng: 77.7011 },
  { locality: "Bellandur", lat: 12.9259, lng: 77.6762 },
  { locality: "Sarjapur Road", lat: 12.9009, lng: 77.6874 },
  { locality: "Hebbal", lat: 13.0358, lng: 77.597 },
  { locality: "Yelahanka", lat: 13.1007, lng: 77.5963 },
  { locality: "Jayanagar", lat: 12.9308, lng: 77.5839 },
  { locality: "J. P. Nagar", lat: 12.9077, lng: 77.5851 },
  { locality: "Bannerghatta Road", lat: 12.8882, lng: 77.597 },
  { locality: "Hennur", lat: 13.041, lng: 77.641 },
  { locality: "Rajajinagar", lat: 12.9914, lng: 77.5526 },
];

const FURNISHING = ["unfurnished", "semi_furnished", "furnished"];

const AMENITIES = {
  residential: [
    "gym",
    "swimming_pool",
    "power_backup",
    "covered_basement_parking",
    "cctv",
    "clubhouse",
    "gated_community",
    "children_s_play_area",
    "landscaped_gardens",
    "rainwater_harvesting",
    "intercom_facility",
    "visitor_parking",
    "high_speed_elevators",
    "modular_kitchen",
    "servant_room",
    "solar_water_heater",
    "ev_charging_stations",
  ],
  commercial: [
    "power_backup",
    "cctv_surveillance",
    "covered_basement_parking",
    "high_speed_internet_fiber",
    "conference_rooms",
    "cafeteria_food_court",
    "reception_lobby",
    "fire_safety_system",
    "central_ac_hvac",
    "server_rooms",
    "co_working_space",
    "valet_parking",
    "meeting_rooms",
    "multi_level_parking",
  ],
  plot: [
    "compound_wall_fencing",
    "clear_title_khata_a_b",
    "rera_registration",
    "borewell_municipal_water",
    "blacktop_concrete_internal_roads",
    "gated_security",
    "stormwater_drains",
    "footpaths",
    "parks_landscaped_roads",
    "underground_drainage_sewage_lines",
    "water_supply_borewell_municipal",
  ],
};

const RESIDENTIAL_KINDS = [
  "Apartment",
  "Villa",
  "Independent House",
  "Penthouse",
  "Builder Floor",
  "Row House",
];
const COMMERCIAL_KINDS = [
  "Office Space",
  "Retail Shop",
  "Commercial Showroom",
  "Co-working Space",
  "Warehouse",
];
const REJECTION_REASONS = [
  "Images do not match the listed property.",
  "Price seems inconsistent with the locality.",
  "Incomplete ownership documents; please re-submit.",
  "Duplicate of an existing active listing.",
];

function chooseStatus() {
  const r = rng();
  if (r < 0.74) return "active";
  if (r < 0.84) return "draft";
  if (r < 0.93) return "pending_verification";
  return "rejected";
}

function futureDate() {
  // 0–270 days out, as YYYY-MM-DD, or null
  if (rng() < 0.3) return null;
  const base = Date.UTC(2026, 6, 1); // pinned base so seed stays deterministic
  const d = new Date(base + randInt(0, 270) * 86400000);
  return d.toISOString().slice(0, 10);
}

function buildOne(type) {
  const loc = pick(LOCALITIES);
  const latitude = (loc.lat + (rng() - 0.5) * 0.02).toFixed(6);
  const longitude = (loc.lng + (rng() - 0.5) * 0.02).toFixed(6);
  const status = chooseStatus();
  const pincode = `5600${randInt(10, 99)}`;
  const amenities = sample(AMENITIES[type], randInt(4, 8));

  const base = {
    property_type: type,
    status,
    locality: loc.locality,
    city: "Bangalore",
    state: "Karnataka",
    pincode,
    address: `#${randInt(1, 400)}, ${randInt(1, 12)}th Main, ${loc.locality}, Bangalore`,
    latitude,
    longitude,
    amenities,
    bathrooms: null,
    furnishing: null,
    available_from: null,
  };

  if (type === "residential") {
    const bedrooms = randInt(1, 5);
    const kind = pick(RESIDENTIAL_KINDS);
    base.bathrooms = Math.max(1, bedrooms - randInt(0, 1));
    base.furnishing = pick(FURNISHING);
    base.available_from = futureDate();
    base.price = roundTo(randInt(5_000_000, 55_000_000), 100_000);
    base.title = `${bedrooms} BHK ${kind} in ${loc.locality}`;
    base.description = `Spacious ${bedrooms} BHK ${kind.toLowerCase()} in ${loc.locality} with ${amenities.length} premium amenities. Well-connected and ready to move in.`;
  } else if (type === "plot") {
    const sqft = roundTo(randInt(1000, 6000), 50);
    base.price = roundTo(randInt(3_000_000, 35_000_000), 100_000);
    base.title = `${sqft} sqft Residential Plot in ${loc.locality}`;
    base.description = `Clear-title ${sqft} sqft residential plot in ${loc.locality}. Ideal for building your dream home or as an investment.`;
  } else {
    const kind = pick(COMMERCIAL_KINDS);
    base.bathrooms = randInt(1, 6);
    base.furnishing = pick(FURNISHING);
    base.available_from = futureDate();
    base.price = roundTo(randInt(10_000_000, 200_000_000), 100_000);
    base.title = `${kind} in ${loc.locality}`;
    base.description = `Premium ${kind.toLowerCase()} in ${loc.locality} at a prime commercial location with excellent footfall and ${amenities.length} amenities.`;
  }

  base.rejection_reason = status === "rejected" ? pick(REJECTION_REASONS) : null;
  return base;
}

function imageUrls(seedKey, n) {
  return Array.from(
    { length: n },
    (_, j) => `https://picsum.photos/seed/${seedKey}-${j}/1200/800`,
  );
}

async function getSeedUserIds(client) {
  const owner = await client.query(
    `SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1`,
  );
  const admin = await client.query(
    `SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`,
  );
  const ownerId = owner.rows[0]?.id ?? admin.rows[0]?.id;
  const adminId = admin.rows[0]?.id ?? ownerId;
  if (!ownerId) {
    throw new Error(
      "No owner or admin user found — seed a user first (npm run db:init with ADMIN_* set, or register an owner).",
    );
  }
  return { ownerId, adminId };
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (RESET) {
      await client.query(
        `TRUNCATE property_images, properties RESTART IDENTITY CASCADE`,
      );
      console.log("⚠ existing properties + property_images truncated (--reset)");
    }

    const { ownerId, adminId } = await getSeedUserIds(client);

    // type mix across COUNT rows: 60% residential, 24% plot, 16% commercial
    const types = [];
    for (let i = 0; i < COUNT; i++) {
      const r = i / COUNT;
      types.push(r < 0.6 ? "residential" : r < 0.84 ? "plot" : "commercial");
    }

    const byStatus = {};
    const byType = {};
    let imageTotal = 0;

    for (let i = 0; i < COUNT; i++) {
      const p = buildOne(types[i]);
      const isActive = p.status === "active";
      const isReviewed = p.status === "active" || p.status === "rejected";

      const { rows } = await client.query(
        `INSERT INTO properties (
           owner_id, title, description, price, property_type,
           bathrooms, furnishing, available_from,
           address, locality, city, state, pincode, latitude, longitude,
           status, rejection_reason, approved_by, approved_at, amenities
         ) VALUES (
           $1,$2,$3,$4,$5,
           $6,$7,$8,
           $9,$10,$11,$12,$13,$14,$15,
           $16,$17,$18, ${isActive ? "NOW()" : "NULL"}, $19
         ) RETURNING id`,
        [
          ownerId,
          p.title,
          p.description,
          p.price,
          p.property_type,
          p.bathrooms,
          p.furnishing,
          p.available_from,
          p.address,
          p.locality,
          p.city,
          p.state,
          p.pincode,
          p.latitude,
          p.longitude,
          p.status,
          p.rejection_reason,
          isReviewed ? adminId : null,
          p.amenities,
        ],
      );

      const propertyId = rows[0].id;
      const imgCount = p.status === "draft" ? randInt(2, 5) : randInt(5, 8);
      const urls = imageUrls(`prop-${propertyId}`, imgCount);
      const values = urls.map((_, j) => `($1, $${j + 2})`).join(", ");
      await client.query(
        `INSERT INTO property_images (property_id, image_url) VALUES ${values}`,
        [propertyId, ...urls],
      );
      imageTotal += imgCount;

      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      byType[p.property_type] = (byType[p.property_type] || 0) + 1;
    }

    await client.query("COMMIT");
    console.log(
      `✓ seeded ${COUNT} properties (owner_id=${ownerId}) with ${imageTotal} images`,
    );
    console.log(`  by type:   ${JSON.stringify(byType)}`);
    console.log(`  by status: ${JSON.stringify(byStatus)}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error("✗ property seed failed:", err.message);
      process.exit(1);
    });
}

export { seed };
