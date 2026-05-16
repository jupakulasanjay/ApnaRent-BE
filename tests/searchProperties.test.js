import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { ensureTestDatabase, TEST_DB_NAME } from "./_testDb.js"

// NOTE: these tests run with the regex fallback (ANTHROPIC_API_KEY is
// unset in `before`). If you want to verify the Claude path, set it
// in your local .env and remove the unset below.
const PORT = 5099
const BASE = `http://localhost:${PORT}`

// Tests ALWAYS use a separate DB (apnarent_test). The dev DB is never touched.
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

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

async function registerAndLogin(email, role) {
  await post("/api/auth/register", { email, password: "password123", role })
  const { json } = await post("/api/auth/login", { email, password: "password123", role })
  return json.token
}

async function createAndActivate(ownerToken, adminToken, data) {
  const created = await post("/api/properties", data, ownerToken)
  assert.equal(created.status, 201, `create failed: ${JSON.stringify(created.json)}`)
  const id = created.json.id
  await post(`/api/properties/${id}/submit`, {}, ownerToken)
  await post(`/api/admin/properties/${id}/approve`, {}, adminToken)
  return id
}

before(async () => {
  // Ensure the model path is NOT taken — tests verify deterministic regex extraction.
  delete process.env.ANTHROPIC_API_KEY

  await ensureTestDatabase()
  await runOnce("node", ["config/initDb.js", "--reset"], TEST_ENV)

  serverProc = spawn("node", ["server.js"], {
    env: { ...process.env, ...TEST_ENV, PORT: String(PORT), ANTHROPIC_API_KEY: "" },
    stdio: "ignore"
  })
  await waitForServer()

  ctx.ownerToken = await registerAndLogin("owner-search@test.com", "owner")
  ctx.adminToken = (await post("/api/auth/login", {
    email: process.env.ADMIN_EMAIL || "admin@apnarent.local",
    password: process.env.ADMIN_PASSWORD || "apnar3nt2026",
    role: "admin"
  })).json.token
  assert.ok(ctx.adminToken, "admin login failed — check ADMIN_EMAIL/ADMIN_PASSWORD in .env")

  // Seed three ACTIVE properties + one DRAFT to prove status filtering.
  ctx.villaId = await createAndActivate(ctx.ownerToken, ctx.adminToken, {
    title: "3BR villa with garden",
    price: 7500000,                       // 75L — below 80L
    property_type: "villa",
    address: "5 Palm Grove",
    locality: "Whitefield",
    city: "Bangalore"
  })
  ctx.commercialId = await createAndActivate(ctx.ownerToken, ctx.adminToken, {
    title: "Retail shop",
    price: 18000000,
    property_type: "commercial",
    address: "100 Main Rd",
    locality: "Koramangala",
    city: "Bangalore"
  })
  ctx.plotId = await createAndActivate(ctx.ownerToken, ctx.adminToken, {
    title: "Open plot",
    price: 7500000,                       // 75L — within 50L–1Cr
    property_type: "plot",
    address: "lot 12",
    city: "Bangalore"
  })

  // Draft — must never appear in search results.
  const draft = await post("/api/properties", {
    title: "DRAFT villa (should not appear)",
    price: 6000000,
    property_type: "villa",
    address: "hidden",
    locality: "Whitefield",
    city: "Bangalore"
  }, ctx.ownerToken)
  ctx.draftId = draft.json.id
})

after(() => {
  if (serverProc) serverProc.kill("SIGTERM")
})

test("case 1: '3BHK villa in Whitefield under 80L' — bhk ignored, others extracted", async () => {
  const { status, json } = await post("/api/search/properties", {
    query: "3BHK villa in Whitefield under 80L"
  })
  assert.equal(status, 200)
  assert.equal(json.filters.property_type, "villa")
  assert.equal(json.filters.locality, "Whitefield")
  assert.equal(json.filters.max_price, 8000000)
  assert.ok(!("bhk" in json.filters), "bhk leaked into property filters")
  // Only the Whitefield villa should match.
  const ids = json.results.map((r) => r.id)
  assert.ok(ids.includes(ctx.villaId))
  assert.ok(!ids.includes(ctx.commercialId))
  assert.ok(!ids.includes(ctx.plotId))
  assert.ok(!ids.includes(ctx.draftId), "draft property appeared in results")
})

test("case 2: 'commercial space in Koramangala'", async () => {
  const { status, json } = await post("/api/search/properties", {
    query: "commercial space in Koramangala"
  })
  assert.equal(status, 200)
  assert.equal(json.filters.property_type, "commercial")
  assert.equal(json.filters.locality, "Koramangala")
  assert.ok(!("city" in json.filters) || json.filters.city == null)
  const ids = json.results.map((r) => r.id)
  assert.ok(ids.includes(ctx.commercialId))
  assert.ok(!ids.includes(ctx.villaId))
})

test("case 3: 'plot between 50L and 1Cr in Bangalore' — city, type, price range", async () => {
  const { status, json } = await post("/api/search/properties", {
    query: "plot between 50L and 1Cr in Bangalore"
  })
  assert.equal(status, 200)
  assert.equal(json.filters.property_type, "plot")
  assert.equal(json.filters.city, "Bangalore")
  assert.equal(json.filters.min_price, 5000000)
  assert.equal(json.filters.max_price, 10000000)
  const ids = json.results.map((r) => r.id)
  assert.ok(ids.includes(ctx.plotId))
  assert.ok(!ids.includes(ctx.villaId))        // wrong type
  assert.ok(!ids.includes(ctx.commercialId))   // wrong type + above 1Cr
})

test("case 4: gibberish → empty filters, all active properties, draft excluded", async () => {
  const { status, json } = await post("/api/search/properties", {
    query: "random gibberish xyz"
  })
  assert.equal(status, 200)
  assert.deepEqual(json.filters, {})
  // All 3 active seeded properties should be returned (at minimum).
  const ids = json.results.map((r) => r.id)
  assert.ok(ids.includes(ctx.villaId))
  assert.ok(ids.includes(ctx.commercialId))
  assert.ok(ids.includes(ctx.plotId))
  assert.ok(!ids.includes(ctx.draftId), "draft appeared when filters were empty")
})

test("case 5: only active properties ever appear (spot-check)", async () => {
  const { json } = await post("/api/search/properties", { query: "" })
  // Empty string fails validation (min 1); use a harmless query.
  const { status, json: j2 } = await post("/api/search/properties", { query: "property" })
  assert.equal(status, 200)
  for (const r of j2.results) {
    assert.notEqual(r.id, ctx.draftId)
  }
})

test("case 6: empty body → 400 validation error", async () => {
  const { status, json } = await post("/api/search/properties", {})
  assert.equal(status, 400)
  assert.equal(json.error, "Validation failed")
  assert.ok(Array.isArray(json.details))
  assert.ok(json.details.some((d) => d.path === "query"))
})

test("/api/search/rentals is unchanged and does not accept property types", async () => {
  // The rental endpoint still returns filters with nulls; verify the contract didn't drift.
  const { status, json } = await post("/api/search/rentals", { query: "2bhk whitefield under 60k" })
  assert.equal(status, 200)
  assert.ok("bhk" in json.filters)
  assert.ok("max_rent" in json.filters)
  assert.ok(!("property_type" in json.filters), "rental endpoint leaked property_type")
})
