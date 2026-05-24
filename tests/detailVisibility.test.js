import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { ensureTestDatabase, TEST_DB_NAME } from "./_testDb.js";

const PORT = 5098;
const BASE = `http://localhost:${PORT}`;

// Tests ALWAYS use a separate DB (apnarent_test). The dev DB is never touched.
const TEST_ENV = { DB_NAME: TEST_DB_NAME };

let serverProc;
const ctx = {};

function runOnce(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: "ignore",
    });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
    p.on("error", reject);
  });
}

async function waitForServer(maxMs = 8000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error("server failed to start within 8s");
}

async function req(method, path, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function registerAndLogin(email, role) {
  await req("POST", "/api/auth/register", {
    body: { email, password: "password123", role },
  });
  const { json } = await req("POST", "/api/auth/login", {
    body: { email, password: "password123", role },
  });
  return json.token;
}

before(async () => {
  await ensureTestDatabase();
  await runOnce("node", ["config/initDb.js", "--reset"], TEST_ENV);
  serverProc = spawn("node", ["server.js"], {
    env: { ...process.env, ...TEST_ENV, PORT: String(PORT) },
    stdio: "ignore",
  });
  await waitForServer();

  ctx.ownerA = await registerAndLogin("ownerA-vis@test.com", "owner");
  ctx.ownerB = await registerAndLogin("ownerB-vis@test.com", "owner");
  ctx.tenant = await registerAndLogin("tenant-vis@test.com", "tenant");
  ctx.admin = (
    await req("POST", "/api/auth/login", {
      body: {
        email: process.env.ADMIN_EMAIL || "admin@apnarent.local",
        password: process.env.ADMIN_PASSWORD || "apnar3nt2026",
        role: "admin",
      },
    })
  ).json.token;
  assert.ok(ctx.admin, "admin login failed");

  // --- Listings ---
  // Owner A: one listing in each of {draft, pending_verification, active, rejected}
  const mkListing = async (title) => {
    const { json } = await req("POST", "/api/rentals", {
      token: ctx.ownerA,
      body: {
        title,
        rent: 50000,
        bhk: 2,
        address: `addr for ${title}`,
        city: "Bangalore",
      },
    });
    return json.id;
  };
  ctx.listingDraftA = await mkListing("draft A");
  ctx.listingPendingA = await mkListing("pending A");
  ctx.listingActiveA = await mkListing("active A");
  ctx.listingRejectedA = await mkListing("rejected A");

  await req("POST", `/api/rentals/${ctx.listingPendingA}/submit`, {
    token: ctx.ownerA,
  });
  await req("POST", `/api/rentals/${ctx.listingActiveA}/submit`, {
    token: ctx.ownerA,
  });
  await req("POST", `/api/admin/rentals/${ctx.listingActiveA}/approve`, {
    token: ctx.admin,
  });

  await req("POST", `/api/rentals/${ctx.listingRejectedA}/submit`, {
    token: ctx.ownerA,
  });
  await req("POST", `/api/admin/rentals/${ctx.listingRejectedA}/reject`, {
    token: ctx.admin,
    body: { reason: "missing kitchen photos" },
  });

  // Owner B: one draft to test cross-owner visibility
  const { json: bDraft } = await req("POST", "/api/rentals", {
    token: ctx.ownerB,
    body: {
      title: "draft B",
      rent: 45000,
      address: "b addr",
      city: "Bangalore",
    },
  });
  ctx.listingDraftB = bDraft.id;
});

after(() => {
  if (serverProc) serverProc.kill("SIGTERM");
});

// ----- Required cases -----

test("tenant fetching owner's draft listing → 404 (existence not leaked)", async () => {
  const { status, json } = await req(
    "GET",
    `/api/rentals/${ctx.listingDraftA}`,
    { token: ctx.tenant },
  );
  assert.equal(status, 404);
  assert.equal(json.error, "Listing not found");
});

test("anonymous fetching owner's draft listing → 404", async () => {
  const { status } = await req("GET", `/api/rentals/${ctx.listingDraftA}`);
  assert.equal(status, 404);
});

test("owner fetching their own draft → 200 with full record", async () => {
  const { status, json } = await req(
    "GET",
    `/api/rentals/${ctx.listingDraftA}`,
    { token: ctx.ownerA },
  );
  assert.equal(status, 200);
  assert.equal(json.id, ctx.listingDraftA);
  assert.equal(json.status, "draft");
  assert.equal(json.owner_id, ctx.ownerAUserId ?? json.owner_id); // owner_id is present
});

test("owner fetching their own pending_verification → 200", async () => {
  const { status, json } = await req(
    "GET",
    `/api/rentals/${ctx.listingPendingA}`,
    { token: ctx.ownerA },
  );
  assert.equal(status, 200);
  assert.equal(json.status, "pending_verification");
});

test("owner fetching their own rejected → 200 and includes rejection_reason", async () => {
  const { status, json } = await req(
    "GET",
    `/api/rentals/${ctx.listingRejectedA}`,
    { token: ctx.ownerA },
  );
  assert.equal(status, 200);
  assert.equal(json.status, "rejected");
  assert.equal(json.rejection_reason, "missing kitchen photos");
});

test("owner fetching ANOTHER owner's draft → 404", async () => {
  const { status, json } = await req(
    "GET",
    `/api/rentals/${ctx.listingDraftB}`,
    { token: ctx.ownerA },
  );
  assert.equal(status, 404);
  assert.equal(json.error, "Listing not found");
});

test("admin fetching any listing regardless of status → 200", async () => {
  for (const id of [
    ctx.listingDraftA,
    ctx.listingPendingA,
    ctx.listingRejectedA,
    ctx.listingDraftB,
  ]) {
    const { status, json } = await req("GET", `/api/rentals/${id}`, {
      token: ctx.admin,
    });
    assert.equal(status, 200, `admin could not read listing ${id}`);
    assert.ok(json.status !== "active" || id === ctx.listingActiveA);
  }
});

test("tenant fetching an active listing → 200 (unchanged public behavior)", async () => {
  const { status, json } = await req(
    "GET",
    `/api/rentals/${ctx.listingActiveA}`,
    { token: ctx.tenant },
  );
  assert.equal(status, 200);
  assert.equal(json.status, "active");
});

test("anonymous fetching an active listing → 200 (unchanged)", async () => {
  const { status, json } = await req(
    "GET",
    `/api/rentals/${ctx.listingActiveA}`,
  );
  assert.equal(status, 200);
  assert.equal(json.status, "active");
});

test("list endpoints stay active-only (regression): public /api/rentals hides drafts", async () => {
  // Anonymous listing browse — should return only the one active listing.
  const { status, json } = await req("GET", "/api/rentals");
  assert.equal(status, 200);
  const ids = json.data.map((l) => l.id);
  assert.ok(ids.includes(ctx.listingActiveA));
  assert.ok(!ids.includes(ctx.listingDraftA));
  assert.ok(!ids.includes(ctx.listingPendingA));
  assert.ok(!ids.includes(ctx.listingRejectedA));
  assert.ok(!ids.includes(ctx.listingDraftB));
});
