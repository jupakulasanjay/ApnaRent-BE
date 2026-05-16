import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { ensureTestDatabase, TEST_DB_NAME } from "./_testDb.js"

const PORT = 5097
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

  ctx.tenant  = await registerAndLogin("tenant-int@test.com", "tenant")
  ctx.tenant2 = await registerAndLogin("tenant2-int@test.com", "tenant")
  ctx.owner   = await registerAndLogin("owner-int@test.com", "owner")
  ctx.admin   = (await req("POST", "/api/auth/login", { body: {
    email:    process.env.ADMIN_EMAIL    || "admin@apnarent.local",
    password: process.env.ADMIN_PASSWORD || "apnar3nt2026",
    role:     "admin"
  }})).json.token
  assert.ok(ctx.admin, "admin login failed")

  // Active listing
  const lc = await req("POST", "/api/rentals", {
    token: ctx.owner,
    body: { title: "active L", rent: 50000, address: "addr L", city: "Bangalore" }
  })
  ctx.listingActive = lc.json.id
  await req("POST", `/api/rentals/${ctx.listingActive}/submit`, { token: ctx.owner })
  await req("POST", `/api/admin/rentals/${ctx.listingActive}/approve`, { token: ctx.admin })

  // Draft listing (not visible to tenant)
  const ld = await req("POST", "/api/rentals", {
    token: ctx.owner,
    body: { title: "draft L", rent: 60000, address: "addr Ld", city: "Bangalore" }
  })
  ctx.listingDraft = ld.json.id

  // Active property
  const pc = await req("POST", "/api/properties", {
    token: ctx.owner,
    body: {
      title: "active P", price: 7500000, property_type: "villa",
      address: "addr P", city: "Bangalore"
    }
  })
  ctx.propertyActive = pc.json.id
  await req("POST", `/api/properties/${ctx.propertyActive}/submit`, { token: ctx.owner })
  await req("POST", `/api/admin/properties/${ctx.propertyActive}/approve`, { token: ctx.admin })

  // Second active listing (used for ordering check)
  const l2 = await req("POST", "/api/rentals", {
    token: ctx.owner,
    body: { title: "active L2", rent: 40000, address: "addr L2", city: "Bangalore" }
  })
  ctx.listingActive2 = l2.json.id
  await req("POST", `/api/rentals/${ctx.listingActive2}/submit`, { token: ctx.owner })
  await req("POST", `/api/admin/rentals/${ctx.listingActive2}/approve`, { token: ctx.admin })
})

after(() => {
  if (serverProc) serverProc.kill("SIGTERM")
})

test("GET /api/interests requires auth", async () => {
  const { status } = await req("GET", "/api/interests")
  assert.equal(status, 401)
})

test("POST /api/interests requires auth", async () => {
  const { status } = await req("POST", "/api/interests", { body: { listing_id: 1 } })
  assert.equal(status, 401)
})

test("POST with neither id → 400", async () => {
  const { status, json } = await req("POST", "/api/interests", { token: ctx.tenant, body: {} })
  assert.equal(status, 400)
  assert.equal(json.error, "Validation failed")
})

test("POST with both ids → 400", async () => {
  const { status, json } = await req("POST", "/api/interests", {
    token: ctx.tenant,
    body: { listing_id: ctx.listingActive, property_id: ctx.propertyActive }
  })
  assert.equal(status, 400)
  assert.equal(json.error, "Validation failed")
})

test("POST listing → 201 with embedded listing including images[]", async () => {
  const { status, json } = await req("POST", "/api/interests", {
    token: ctx.tenant,
    body: { listing_id: ctx.listingActive }
  })
  assert.equal(status, 201)
  assert.equal(json.kind, "listing")
  assert.equal(json.target_id, ctx.listingActive)
  assert.equal(json.listing.id, ctx.listingActive)
  assert.ok(Array.isArray(json.listing.images))
  ctx.listingInterestId = json.id
})

test("POST same listing again → 200 (idempotent) with same id", async () => {
  const { status, json } = await req("POST", "/api/interests", {
    token: ctx.tenant,
    body: { listing_id: ctx.listingActive }
  })
  assert.equal(status, 200)
  assert.equal(json.id, ctx.listingInterestId)
})

test("POST property → 201 with embedded property", async () => {
  const { status, json } = await req("POST", "/api/interests", {
    token: ctx.tenant,
    body: { property_id: ctx.propertyActive }
  })
  assert.equal(status, 201)
  assert.equal(json.kind, "property")
  assert.equal(json.target_id, ctx.propertyActive)
  assert.equal(json.property.id, ctx.propertyActive)
})

test("POST non-existent listing → 404", async () => {
  const { status } = await req("POST", "/api/interests", {
    token: ctx.tenant,
    body: { listing_id: 999999 }
  })
  assert.equal(status, 404)
})

test("POST draft listing as tenant → 404 (not visible)", async () => {
  const { status } = await req("POST", "/api/interests", {
    token: ctx.tenant,
    body: { listing_id: ctx.listingDraft }
  })
  assert.equal(status, 404)
})

test("GET returns own interests ordered created_at DESC, scoped to user", async () => {
  // Save a second listing for ordering check.
  await req("POST", "/api/interests", {
    token: ctx.tenant,
    body: { listing_id: ctx.listingActive2 }
  })

  const { status, json } = await req("GET", "/api/interests", { token: ctx.tenant })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json))
  assert.equal(json.length, 3)
  // Most recent first.
  assert.equal(json[0].kind, "listing")
  assert.equal(json[0].target_id, ctx.listingActive2)

  // Each entry has the embedded object with images[].
  for (const entry of json) {
    if (entry.kind === "listing") assert.ok(Array.isArray(entry.listing.images))
    if (entry.kind === "property") assert.ok(Array.isArray(entry.property.images))
  }
})

test("Other user sees empty interests list", async () => {
  const { status, json } = await req("GET", "/api/interests", { token: ctx.tenant2 })
  assert.equal(status, 200)
  assert.deepEqual(json, [])
})

test("DELETE /api/interests/listing/:id → 204 and removes from GET", async () => {
  const del = await req("DELETE", `/api/interests/listing/${ctx.listingActive}`, { token: ctx.tenant })
  assert.equal(del.status, 204)

  const get = await req("GET", "/api/interests", { token: ctx.tenant })
  // listings and properties have independent SERIAL ids — match on (kind,target_id) pairs.
  const pairs = get.json.map((r) => `${r.kind}:${r.target_id}`)
  assert.ok(!pairs.includes(`listing:${ctx.listingActive}`))
  assert.ok(pairs.includes(`listing:${ctx.listingActive2}`))
  assert.ok(pairs.includes(`property:${ctx.propertyActive}`))
})

test("DELETE same interest again → 404", async () => {
  const { status } = await req("DELETE", `/api/interests/listing/${ctx.listingActive}`, { token: ctx.tenant })
  assert.equal(status, 404)
})

test("DELETE with bad kind → 400", async () => {
  const { status } = await req("DELETE", `/api/interests/garbage/1`, { token: ctx.tenant })
  assert.equal(status, 400)
})
