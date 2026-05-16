import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { ensureTestDatabase, TEST_DB_NAME } from "./_testDb.js"

const PORT = 5095
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

async function registerAndLogin(email, role, name) {
  await req("POST", "/api/auth/register", { body: { email, password: "password123", role, name } })
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

  ctx.tenant = await registerAndLogin("tenant-adm@test.com", "tenant", "Tara")
  ctx.owner  = await registerAndLogin("owner-adm@test.com", "owner", "Olive Owner")
  ctx.admin  = (await req("POST", "/api/auth/login", { body: {
    email:    process.env.ADMIN_EMAIL    || "admin@apnarent.local",
    password: process.env.ADMIN_PASSWORD || "apnar3nt2026",
    role:     "admin"
  }})).json.token
  assert.ok(ctx.admin, "admin login failed")
})

after(() => {
  if (serverProc) serverProc.kill("SIGTERM")
})

test("admin can POST /api/properties — auto-published, tagged ApnaRent", async () => {
  const { status, json } = await req("POST", "/api/properties", {
    token: ctx.admin,
    body: {
      title: "Apnarent flagship villa",
      price: 9500000,
      property_type: "villa",
      address: "1 Apnarent Lane",
      city: "Bangalore"
    }
  })
  assert.equal(status, 201)
  assert.equal(json.status, "active", "admin-created property should auto-publish")
  assert.equal(json.posted_by, "ApnaRent")
  assert.ok(json.approved_at, "approved_at should be set")
  ctx.adminPropertyId = json.id
})

test("owner-created property is tagged with the owner's name", async () => {
  const created = await req("POST", "/api/properties", {
    token: ctx.owner,
    body: {
      title: "Owner-listed plot",
      price: 4000000,
      property_type: "plot",
      address: "lot 7",
      city: "Bangalore"
    }
  })
  assert.equal(created.status, 201)
  assert.equal(created.json.status, "draft", "owner-created property starts as draft")
  assert.equal(created.json.posted_by, "Olive Owner")
  ctx.ownerPropertyId = created.json.id

  // After submit + approve, posted_by stays the same (owner's name) and is
  // present on the admin approve response itself.
  await req("POST", `/api/properties/${ctx.ownerPropertyId}/submit`, { token: ctx.owner })
  const approved = await req("POST", `/api/admin/properties/${ctx.ownerPropertyId}/approve`, { token: ctx.admin })
  assert.equal(approved.json.status, "active")
  assert.equal(approved.json.posted_by, "Olive Owner")

  const fetched = await req("GET", `/api/properties/${ctx.ownerPropertyId}`)
  assert.equal(fetched.status, 200)
  assert.equal(fetched.json.posted_by, "Olive Owner")
})

test("public list returns posted_by for both admin- and owner-created properties", async () => {
  const { status, json } = await req("GET", "/api/properties")
  assert.equal(status, 200)
  const adminRow = json.data.find((p) => p.id === ctx.adminPropertyId)
  const ownerRow = json.data.find((p) => p.id === ctx.ownerPropertyId)
  assert.equal(adminRow.posted_by, "ApnaRent")
  assert.equal(ownerRow.posted_by, "Olive Owner")
})

test("GET /api/properties/:id returns posted_by", async () => {
  const adminProp = await req("GET", `/api/properties/${ctx.adminPropertyId}`)
  assert.equal(adminProp.json.posted_by, "ApnaRent")

  const ownerProp = await req("GET", `/api/properties/${ctx.ownerPropertyId}`)
  assert.equal(ownerProp.json.posted_by, "Olive Owner")
})

test("admin /api/properties/owned returns only the admin's own properties, tagged ApnaRent", async () => {
  const { status, json } = await req("GET", "/api/properties/owned", { token: ctx.admin })
  assert.equal(status, 200)
  // Should include the admin's flagship but NOT the owner's plot.
  const ids = json.data.map((p) => p.id)
  assert.ok(ids.includes(ctx.adminPropertyId))
  assert.ok(!ids.includes(ctx.ownerPropertyId))
  for (const p of json.data) assert.equal(p.posted_by, "ApnaRent")
})

test("admin can edit their own active property in place (no unpublish required)", async () => {
  const { status, json } = await req("PUT", `/api/properties/${ctx.adminPropertyId}`, {
    token: ctx.admin,
    body: { title: "Apnarent flagship villa — updated" }
  })
  assert.equal(status, 200)
  assert.equal(json.title, "Apnarent flagship villa — updated")
  assert.equal(json.status, "active", "stays active")
  assert.equal(json.posted_by, "ApnaRent")
})

test("admin cannot edit an owner's property via PUT /api/properties/:id (not their owner_id)", async () => {
  const { status } = await req("PUT", `/api/properties/${ctx.ownerPropertyId}`, {
    token: ctx.admin,
    body: { title: "hijack attempt" }
  })
  assert.equal(status, 403)
})

test("tenant still cannot POST /api/properties", async () => {
  const { status } = await req("POST", "/api/properties", {
    token: ctx.tenant,
    body: {
      title: "tenant-attempted",
      price: 1000,
      property_type: "apartment",
      address: "x",
      city: "Bangalore"
    }
  })
  assert.equal(status, 403)
})
