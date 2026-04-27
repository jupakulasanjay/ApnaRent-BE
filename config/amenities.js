// Static amenities catalogue surfaced by GET /api/amenities?kind=<kind>.
//
// Owners pick from this list when creating a listing/property; "Add custom"
// in the FE just sends a free-text string in the amenities[] array on write.
// We store amenity selections as TEXT[] on listings/properties — slugs from
// this catalogue OR raw user-entered strings — so this file is purely a
// dropdown source, not a foreign-key table.

const SVG_HEAD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`
const s = (body) => `${SVG_HEAD}${body}</svg>`

// Reusable icon set. Amenities reference these by slug; the API returns the
// catalogue plus this map so the FE can render inline SVG without bundling
// an icon library.
export const ICONS = {
  shield:       s(`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`),
  camera:       s(`<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>`),
  bolt:         s(`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`),
  droplet:      s(`<path d="M12 2.5s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11z"/>`),
  car:          s(`<path d="M5 17h14M5 17l-2-5 2-5h14l2 5-2 5M5 17v3M19 17v3"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>`),
  dumbbell:     s(`<path d="M2 12h2M20 12h2M6 8v8M18 8v8M9 6v12M15 6v12M9 12h6"/>`),
  pool:         s(`<path d="M2 18c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1M2 22c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1M6 14V6a3 3 0 0 1 6 0M12 14V6a3 3 0 0 1 6 0"/>`),
  tree:         s(`<path d="M12 22V12M8 12c-3 0-5-2-5-5s2-5 5-5h8c3 0 5 2 5 5s-2 5-5 5z"/><path d="M9 17l-2 5h10l-2-5"/>`),
  road:         s(`<path d="M4 22 7 2h10l3 20"/><path d="M12 6v3M12 13v3M12 19v1"/>`),
  key:          s(`<circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 8.15-8.15M16 8l3 3M19 5l2 2"/>`),
  elevator:     s(`<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 8l3-3 3 3M9 16l3 3 3-3"/>`),
  flame:        s(`<path d="M12 2s4 4 4 8a4 4 0 1 1-8 0c0-1 .5-2 1-3 0 2 1 3 2 3 0-3 1-5 1-8z"/>`),
  recycle:      s(`<path d="M7 19l-3-3 3-3M3 16h12a3 3 0 0 0 3-3v-1M17 5l3 3-3 3M21 8H9a3 3 0 0 0-3 3v1"/>`),
  sun:          s(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`),
  wifi:         s(`<path d="M5 12.55a11 11 0 0 1 14 0M8.5 16.43a6 6 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0"/><circle cx="12" cy="20" r="0.5" fill="currentColor"/>`),
  coffee:       s(`<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v3M10 2v3M14 2v3"/>`),
  users:        s(`<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/>`),
  home:         s(`<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>`),
  building:     s(`<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>`),
  bell:         s(`<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>`),
  briefcase:    s(`<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>`),
  shopping_bag: s(`<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>`),
  compass:      s(`<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88"/>`),
  wrench:       s(`<path d="M14.7 6.3a4 4 0 0 0 5.4 5.4L21 12l-9 9-3-3 9-9z"/><path d="M9 11 3 17l3 3 6-6"/>`),
  play:         s(`<polygon points="5 3 19 12 5 21 5 3"/>`),
  file_check:   s(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/>`),
  music:        s(`<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`),
  package:      s(`<path d="M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>`),
  layout:       s(`<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>`)
}

// Helper: build amenity entries with a shared icon. Slug auto-derived if omitted.
function group(category, icon, items) {
  return {
    category,
    icon,
    amenities: items.map((item) => {
      if (typeof item === "string") return { slug: slugify(item), label: item, icon }
      return { slug: item.slug || slugify(item.label), label: item.label, icon: item.icon || icon }
    })
  }
}

function slugify(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

const LAND_PLOT = [
  group("Infrastructure", "road", [
    "Blacktop / concrete internal roads",
    "Road width",
    "Stormwater drains",
    "Underground drainage / sewage lines",
    "Footpaths"
  ]),
  group("Utilities", "bolt", [
    { label: "BESCOM / local electricity connection", icon: "bolt" },
    { label: "Water pipelines (municipal / borewell)", icon: "droplet" },
    { label: "Overhead tank provision", icon: "droplet" },
    { label: "Underground cabling", icon: "bolt" }
  ]),
  group("Security & Layout", "shield", [
    { label: "Gated community", icon: "shield" },
    { label: "Compound wall / fencing", icon: "shield" },
    { label: "Security cabin", icon: "shield" },
    { label: "CCTV", icon: "camera" }
  ]),
  group("Community Features", "tree", [
    { label: "Parks / open green spaces", icon: "tree" },
    { label: "Children's play area", icon: "play" },
    { label: "Walking track", icon: "users" },
    { label: "Clubhouse", icon: "building" }
  ]),
  group("Legal & Compliance", "file_check", [
    "DC conversion",
    "Local authority approval (BDA / DTCP / Panchayat)",
    "RERA registration",
    "Clear title & Khata (A/B)"
  ])
]

const APARTMENT = [
  group("Security", "shield", [
    { label: "24/7 security guards", icon: "shield" },
    { label: "CCTV surveillance", icon: "camera" },
    { label: "Video door phone", icon: "bell" },
    { label: "Intercom facility", icon: "bell" },
    { label: "Access card / biometric entry", icon: "key" }
  ]),
  group("Power & Utilities", "bolt", [
    { label: "24/7 water supply", icon: "droplet" },
    { label: "Borewell + Cauvery / municipal water", icon: "droplet" },
    { label: "Power backup (common + flat)", icon: "bolt" },
    { label: "Solar panels", icon: "sun" },
    { label: "Gas pipeline (PNG)", icon: "flame" }
  ]),
  group("Core Infrastructure", "building", [
    { label: "Lifts (passenger + service)", icon: "elevator" },
    { label: "Fire safety system", icon: "flame" },
    { label: "Garbage chute / disposal", icon: "recycle" },
    { label: "Sewage Treatment Plant (STP)", icon: "recycle" },
    { label: "Rainwater harvesting", icon: "droplet" }
  ]),
  group("Parking", "car", [
    "Covered / basement parking",
    "Visitor parking",
    "EV charging stations"
  ]),
  group("Lifestyle Amenities", "dumbbell", [
    { label: "Gym", icon: "dumbbell" },
    { label: "Swimming pool", icon: "pool" },
    { label: "Clubhouse", icon: "building" },
    { label: "Indoor games (TT, billiards, squash)", icon: "play" },
    { label: "Yoga / meditation room", icon: "users" },
    { label: "Spa / sauna / steam", icon: "droplet" }
  ]),
  group("Outdoor Amenities", "tree", [
    { label: "Children's play area", icon: "play" },
    { label: "Jogging / cycling track", icon: "users" },
    { label: "Landscaped gardens", icon: "tree" },
    { label: "Amphitheatre", icon: "music" },
    { label: "Sports courts (tennis, basketball, cricket net)", icon: "play" }
  ]),
  group("Convenience", "shopping_bag", [
    { label: "Maintenance office", icon: "briefcase" },
    { label: "Mini supermarket", icon: "shopping_bag" },
    { label: "ATM", icon: "shopping_bag" },
    { label: "Laundry services", icon: "package" },
    { label: "Co-working space", icon: "briefcase" }
  ])
]

const VILLA = [
  group("Private Features", "home", [
    { label: "Private garden / lawn", icon: "tree" },
    { label: "Terrace", icon: "home" },
    { label: "Balcony", icon: "home" },
    { label: "Private parking (2-3 cars)", icon: "car" },
    { label: "Servant room", icon: "home" }
  ]),
  group("Utilities", "bolt", [
    { label: "Borewell + municipal water", icon: "droplet" },
    { label: "Power backup", icon: "bolt" },
    { label: "Solar water heater", icon: "sun" },
    { label: "Smart home automation", icon: "wrench" }
  ]),
  group("Community Features", "shield", [
    { label: "Gated security", icon: "shield" },
    { label: "CCTV", icon: "camera" },
    { label: "Clubhouse", icon: "building" },
    { label: "Swimming pool", icon: "pool" },
    { label: "Parks & landscaped roads", icon: "tree" }
  ]),
  group("Lifestyle", "dumbbell", [
    { label: "Gym", icon: "dumbbell" },
    { label: "Sports courts", icon: "play" },
    { label: "Walking tracks", icon: "users" },
    { label: "Party hall", icon: "music" }
  ])
]

const HOUSE = [
  group("Basic", "home", [
    { label: "Private parking", icon: "car" },
    { label: "Water supply (borewell + municipal)", icon: "droplet" },
    { label: "Electricity connection", icon: "bolt" },
    { label: "Terrace", icon: "home" }
  ]),
  group("Advanced / Optional", "wrench", [
    { label: "Inverter / generator backup", icon: "bolt" },
    { label: "CCTV / security system", icon: "camera" },
    { label: "Modular kitchen", icon: "wrench" },
    { label: "False ceiling & interiors", icon: "home" },
    { label: "Rainwater harvesting", icon: "droplet" },
    { label: "Solar panels", icon: "sun" },
    { label: "Home automation", icon: "wrench" }
  ]),
  group("Outdoor", "tree", [
    { label: "Garden", icon: "tree" },
    { label: "Sit-out / veranda", icon: "home" },
    { label: "Storage room", icon: "package" }
  ])
]

const COMMERCIAL = [
  group("Building Infrastructure", "building", [
    { label: "High-speed elevators", icon: "elevator" },
    { label: "Service lifts", icon: "elevator" },
    { label: "Central AC / HVAC", icon: "wrench" },
    { label: "Power backup (100%)", icon: "bolt" },
    { label: "Fire safety compliance", icon: "flame" }
  ]),
  group("Security", "shield", [
    { label: "24/7 security", icon: "shield" },
    { label: "Access control (RFID / biometric)", icon: "key" },
    { label: "CCTV", icon: "camera" }
  ]),
  group("Parking", "car", [
    "Multi-level parking",
    "Visitor parking",
    "Valet parking"
  ]),
  group("Office Facilities", "briefcase", [
    { label: "Conference rooms", icon: "briefcase" },
    { label: "Meeting rooms", icon: "users" },
    { label: "Reception / lobby", icon: "building" },
    { label: "Co-working spaces", icon: "briefcase" }
  ]),
  group("Connectivity", "wifi", [
    { label: "High-speed internet / fiber", icon: "wifi" },
    { label: "IT infrastructure", icon: "wifi" },
    { label: "Server rooms", icon: "package" }
  ]),
  group("Convenience", "coffee", [
    { label: "Cafeteria / food court", icon: "coffee" },
    { label: "Pantry", icon: "coffee" },
    { label: "ATM / bank", icon: "shopping_bag" },
    { label: "Retail shops", icon: "shopping_bag" }
  ])
]

// Internal kind → catalogue map. `land` and `plot` share the same list per
// the source spec (they're grouped together as "Land / Plot Amenities").
const CATALOGUE = {
  land:       LAND_PLOT,
  plot:       LAND_PLOT,
  apartment:  APARTMENT,
  villa:      VILLA,
  house:      HOUSE,
  commercial: COMMERCIAL
}

export const SUPPORTED_KINDS = Object.keys(CATALOGUE)

export function getCatalogueForKind(kind) {
  const groups = CATALOGUE[kind]
  if (!groups) return null

  // Flatten into a single list. The FE renders this as one dropdown — `category`
  // is kept on each item so an <optgroup> is still possible within one select.
  const amenities = []
  const seenSlugs = new Set()
  const usedIconSlugs = new Set()
  for (const g of groups) {
    for (const a of g.amenities) {
      if (seenSlugs.has(a.slug)) continue   // dedupe across categories (e.g. "CCTV" appears twice)
      seenSlugs.add(a.slug)
      amenities.push({ slug: a.slug, label: a.label, icon: a.icon, category: g.category })
      usedIconSlugs.add(a.icon)
    }
  }

  const icons = {}
  for (const slug of usedIconSlugs) {
    if (ICONS[slug]) icons[slug] = ICONS[slug]
  }

  return { kind, amenities, icons }
}
