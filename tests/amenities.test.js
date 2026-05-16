import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { ensureTestDatabase, TEST_DB_NAME } from "./_testDb.js"

const PORT = 5096
const BASE = `http://localhost:${PORT}`

const TEST_ENV = { DB_NAME: TEST_DB_NAME }

let serverProc
const ctx = {}

function runOnce(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: "ignore" })
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    p.on("error", reject)
  })
}

async function waitForServer(maxMs = 8000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/`)
      if (r.ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error("server failed to start within 8s")
}

async function req(method, path, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

async function registerAndLogin(email, role) {
  await req("POST", "/api/auth/register", { body: { email, password: "password123", role } })
  const { json } = await req("POST", "/api/auth/login", { body: { email, password: "password123", role } })
  return json.token
}

before(async () => {
  await ensureTestDatabase()
  await runOnce("node", ["config/initDb.js", "--reset"], TEST_ENV)
  serverProc = spawn("node", ["server.js"], {
    env: { ...process.env, ...TEST_ENV, PORT: String(PORT) },
    stdio: "ignore"
  })
  await waitForServer()

  ctx.owner = await registerAndLogin("owner-amen@test.com", "owner")
})

after(() => {
  if (serverProc) serverProc.kill("SIGTERM")
})

test("GET /api/amenities without kind → 400", async () => {
  const { status, json } = await req("GET", "/api/amenities")
  assert.equal(status, 400)
  assert.equal(json.error, "Validation failed")
})

test("GET /api/amenities?kind=invalid → 400", async () => {
  const { status, json } = await req("GET", "/api/amenities?kind=spaceship")
  assert.equal(status, 400)
  assert.equal(json.error, "Validation failed")
})

test("GET /api/amenities?kind=apartment → 200 with flat amenities + icons map", async () => {
  const { status, json } = await req("GET", "/api/amenities?kind=apartment")
  assert.equal(status, 200)
  assert.equal(json.kind, "apartment")
  assert.ok(Array.isArray(json.amenities))
  assert.ok(json.amenities.length > 0)

  // Each amenity is flat: { slug, label, icon, category }.
  for (const a of json.amenities) {
    assert.ok(a.slug && a.label && a.icon && a.category)
    assert.ok(json.icons[a.icon], `missing icon "${a.icon}" in icons map`)
    assert.ok(json.icons[a.icon].startsWith("<svg"))
  }

  // At least one expected entry from the Security group survived flattening.
  assert.ok(json.amenities.some((a) => a.slug === "24_7_security_guards"))
})

test("GET /api/amenities?kind=land and ?kind=plot return identical catalogues", async () => {
  const land = (await req("GET", "/api/amenities?kind=land")).json
  const plot = (await req("GET", "/api/amenities?kind=plot")).json
  assert.deepEqual(land.amenities, plot.amenities)
})

test("All supported kinds return non-empty catalogues", async () => {
  for (const kind of ["land", "plot", "apartment", "villa", "house", "commercial"]) {
    const { status, json } = await req("GET", `/api/amenities?kind=${kind}`)
    assert.equal(status, 200, `kind=${kind} did not return 200`)
    assert.ok(json.amenities.length > 0, `kind=${kind} has no amenities`)
  }
})

test("Flattened list dedupes slugs that appear in multiple categories", async () => {
  // Apartment lists "Children's play area" under both Lifestyle and Outdoor;
  // the flat array should contain it exactly once.
  const { json } = await req("GET", "/api/amenities?kind=apartment")
  const slugs = json.amenities.map((a) => a.slug)
  const uniq = new Set(slugs)
  assert.equal(slugs.length, uniq.size, `duplicate slugs in flat list: ${slugs.length} vs ${uniq.size}`)
})

test("Owner can persist selected + custom amenities on a property; reads back as array", async () => {
  const created = await req("POST", "/api/properties", {
    token: ctx.owner,
    body: {
      title: "Villa with extras",
      price: 8500000,
      property_type: "villa",
      address: "12 Palm Avenue",
      city: "Bangalore",
      amenities: ["private_garden_lawn", "swimming_pool", "Custom: rooftop solar farm"]
    }
  })
  assert.equal(created.status, 201)
  assert.deepEqual(
    created.json.amenities,
    ["private_garden_lawn", "swimming_pool", "Custom: rooftop solar farm"]
  )

  // GET /api/properties/:id round-trips the amenities array.
  const fetched = await req("GET", `/api/properties/${created.json.id}`, { token: ctx.owner })
  assert.equal(fetched.status, 200)
  assert.deepEqual(fetched.json.amenities, created.json.amenities)
})

test("Listing supports amenities[] on create + update", async () => {
  const created = await req("POST", "/api/rentals", {
    token: ctx.owner,
    body: {
      title: "2BHK with gym",
      rent: 35000,
      address: "5 Elm Street",
      city: "Bangalore",
      amenities: ["gym", "covered_basement_parking"]
    }
  })
  assert.equal(created.status, 201)
  assert.deepEqual(created.json.amenities, ["gym", "covered_basement_parking"])

  const updated = await req("PUT", `/api/rentals/${created.json.id}`, {
    token: ctx.owner,
    body: { amenities: ["gym", "swimming_pool", "Custom: rooftop terrace"] }
  })
  assert.equal(updated.status, 200)
  assert.deepEqual(
    updated.json.amenities,
    ["gym", "swimming_pool", "Custom: rooftop terrace"]
  )
})

test("Property created without amenities defaults to empty array", async () => {
  const { status, json } = await req("POST", "/api/properties", {
    token: ctx.owner,
    body: {
      title: "Plain property",
      price: 5000000,
      property_type: "apartment",
      address: "no amenities",
      city: "Bangalore"
    }
  })
  assert.equal(status, 201)
  assert.deepEqual(json.amenities, [])
})

test("Validator rejects amenity strings beyond max length", async () => {
  const tooLong = "x".repeat(121)
  const { status } = await req("POST", "/api/properties", {
    token: ctx.owner,
    body: {
      title: "x", price: 1, property_type: "apartment",
      address: "a", city: "Bangalore",
      amenities: [tooLong]
    }
  })
  assert.equal(status, 400)
})
