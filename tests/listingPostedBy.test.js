import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { ensureTestDatabase, TEST_DB_NAME } from "./_testDb.js"

const PORT = 5094
const BASE = `http://localhost:${PORT}`

const TEST_ENV = { DB_NAME: TEST_DB_NAME, ANTHROPIC_API_KEY: "" }

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

async function registerAndLogin(email, role, name) {
  await req("POST", "/api/auth/register", { body: { email, password: "password123", role, name } })
  const { json } = await req("POST", "/api/auth/login", { body: { email, password: "password123", role } })
  return json.token
}

before(async () => {
  delete process.env.ANTHROPIC_API_KEY

  await ensureTestDatabase()
  await runOnce("node", ["config/initDb.js", "--reset"], TEST_ENV)
  serverProc = spawn("node", ["server.js"], {
    env: { ...process.env, ...TEST_ENV, PORT: String(PORT) },
    stdio: "ignore"
  })
  await waitForServer()

  ctx.owner = await registerAndLogin("owner-listpb@test.com", "owner", "Lara Lister")
  ctx.admin = (await req("POST", "/api/auth/login", { body: {
    email:    process.env.ADMIN_EMAIL    || "admin@apnarent.local",
    password: process.env.ADMIN_PASSWORD || "apnar3nt2026",
    role:     "admin"
  }})).json.token
  assert.ok(ctx.admin, "admin login failed")
})

after(() => {
  if (serverProc) serverProc.kill("SIGTERM")
})

test("POST /api/rentals (owner) → response includes posted_by = owner's name", async () => {
  const { status, json } = await req("POST", "/api/rentals", {
    token: ctx.owner,
    body: {
      title: "2BHK in Indiranagar",
      rent: 35000,
      bhk: 2,
      address: "11 Indira Lane",
      locality: "Indiranagar",
      city: "Bangalore"
    }
  })
  assert.equal(status, 201)
  assert.equal(json.posted_by, "Lara Lister")
  ctx.listingId = json.id
})

test("PUT /api/rentals/:id response includes posted_by", async () => {
  const { status, json } = await req("PUT", `/api/rentals/${ctx.listingId}`, {
    token: ctx.owner,
    body: { rent: 36000 }
  })
  assert.equal(status, 200)
  assert.equal(json.rent, 36000)
  assert.equal(json.posted_by, "Lara Lister")
})

test("POST /api/rentals/:id/submit response includes posted_by", async () => {
  const { status, json } = await req("POST", `/api/rentals/${ctx.listingId}/submit`, { token: ctx.owner })
  assert.equal(status, 200)
  assert.equal(json.status, "pending_verification")
  assert.equal(json.posted_by, "Lara Lister")
})

test("GET /api/admin/rentals/pending → each item carries posted_by", async () => {
  const { status, json } = await req("GET", "/api/admin/rentals/pending", { token: ctx.admin })
  assert.equal(status, 200)
  assert.ok(json.data.length >= 1)
  for (const l of json.data) {
    assert.ok(typeof l.posted_by === "string" && l.posted_by.length > 0)
  }
  const ours = json.data.find((l) => l.id === ctx.listingId)
  assert.equal(ours.posted_by, "Lara Lister")
})

test("POST /api/admin/rentals/:id/approve → response includes posted_by", async () => {
  const { status, json } = await req("POST", `/api/admin/rentals/${ctx.listingId}/approve`, { token: ctx.admin })
  assert.equal(status, 200)
  assert.equal(json.status, "active")
  assert.equal(json.posted_by, "Lara Lister")
})

test("GET /api/rentals (public list) → every item has posted_by", async () => {
  const { status, json } = await req("GET", "/api/rentals")
  assert.equal(status, 200)
  for (const l of json.data) {
    assert.ok(typeof l.posted_by === "string" && l.posted_by.length > 0)
  }
  const ours = json.data.find((l) => l.id === ctx.listingId)
  assert.equal(ours.posted_by, "Lara Lister")
})

test("GET /api/rentals/:id → posted_by present", async () => {
  const { status, json } = await req("GET", `/api/rentals/${ctx.listingId}`)
  assert.equal(status, 200)
  assert.equal(json.posted_by, "Lara Lister")
})

test("GET /api/rentals/owned → posted_by present on each item", async () => {
  const { status, json } = await req("GET", "/api/rentals/owned", { token: ctx.owner })
  assert.equal(status, 200)
  for (const l of json.data) {
    assert.equal(l.posted_by, "Lara Lister")
  }
})

test("POST /api/search/rentals → results[] each have posted_by (regex fallback path)", async () => {
  const { status, json } = await req("POST", "/api/search/rentals", {
    body: { query: "2bhk indiranagar" }
  })
  assert.equal(status, 200)
  assert.ok(Array.isArray(json.results))
  assert.ok(json.results.length >= 1)
  for (const r of json.results) {
    assert.ok(typeof r.posted_by === "string" && r.posted_by.length > 0)
  }
})

// --- Listings posted by an admin user surface "ApnaRent" ---
//
// Listings don't currently have an admin-create flow on the routes (the user
// only opened that for properties), so we exercise the resolver via a
// pending_verification listing whose owner_id is overridden in-DB to point
// at the admin user. This keeps the test about the resolver, not the
// routing.
test("listing whose owner_id is the admin user → posted_by = ApnaRent", async () => {
  // Create as owner, then re-point owner_id to the admin user via direct
  // DB update. We do this by making a small helper request: there's no
  // admin-only endpoint for re-assigning ownership, so we'll use a quick
  // raw query through pg via the same env the server has.
  //
  // (If/when admin gets a POST /api/rentals flow, replace this with a
  // proper create call.)
  const pg = await import("pg")
  const { Client } = pg.default
  const client = new Client({
    user:     process.env.DB_USER,
    host:     process.env.DB_HOST,
    database: TEST_DB_NAME,
    password: process.env.DB_PASSWORD,
    port:     process.env.DB_PORT
  })
  await client.connect()
  try {
    // Create a fresh listing as owner.
    const created = await req("POST", "/api/rentals", {
      token: ctx.owner,
      body: { title: "soon-to-be-apnarent", rent: 25000, address: "x", city: "Bangalore" }
    })
    const listingId = created.json.id

    // Reassign to admin.
    const adminRow = await client.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`)
    const adminId = adminRow.rows[0].id
    await client.query(`UPDATE listings SET owner_id = $1 WHERE id = $2`, [adminId, listingId])
    await client.query(`UPDATE listings SET status = 'active' WHERE id = $1`, [listingId])

    const { status, json } = await req("GET", `/api/rentals/${listingId}`)
    assert.equal(status, 200)
    assert.equal(json.posted_by, "ApnaRent")
  } finally {
    await client.end()
  }
})
