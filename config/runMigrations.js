import "dotenv/config"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import pool from "./db.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, "migrations")

export async function ensureTrackingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function listMigrationFiles() {
  try {
    const entries = await fs.readdir(MIGRATIONS_DIR)
    return entries.filter((f) => f.endsWith(".sql")).sort()
  } catch (err) {
    if (err.code === "ENOENT") return []
    throw err
  }
}

async function getApplied() {
  const { rows } = await pool.query(`SELECT name FROM schema_migrations`)
  return new Set(rows.map((r) => r.name))
}

async function applyOne(name) {
  const sql = await fs.readFile(path.join(MIGRATIONS_DIR, name), "utf8")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(sql)
    await client.query(
      `INSERT INTO schema_migrations (name) VALUES ($1)`,
      [name]
    )
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    err.migration = name
    throw err
  } finally {
    client.release()
  }
}

// Apply any migrations not yet recorded. Each runs in its own transaction.
export async function runMigrations({ silent = false } = {}) {
  await ensureTrackingTable()
  const applied = await getApplied()
  const files = await listMigrationFiles()
  const pending = files.filter((f) => !applied.has(f))

  if (pending.length === 0) {
    if (!silent) console.log("• no migrations to apply")
    return { applied: [] }
  }

  const appliedNow = []
  for (const name of pending) {
    if (!silent) console.log(`  → applying ${name}`)
    await applyOne(name)
    if (!silent) console.log(`  ✓ ${name}`)
    appliedNow.push(name)
  }
  return { applied: appliedNow }
}

// Called by initDb.js after a fresh-install bootstrap — every migration the
// repo currently ships is already baked into config/schema/, so we mark them
// all as applied to prevent runMigrations() from re-running them.
export async function markAllApplied({ silent = false } = {}) {
  await ensureTrackingTable()
  const files = await listMigrationFiles()
  for (const name of files) {
    await pool.query(
      `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [name]
    )
  }
  if (!silent) {
    console.log(`✓ baselined schema_migrations (${files.length} migration${files.length === 1 ? "" : "s"} known)`)
  }
}

// CLI entry
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error(`✗ migration failed${err.migration ? ` (${err.migration})` : ""}:`, err.message)
      process.exit(1)
    })
}
