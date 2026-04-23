import "dotenv/config"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import bcrypt from "bcryptjs"
import pool from "./db.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = path.join(__dirname, "schema")
const RESET = process.argv.includes("--reset")

async function resetTables() {
  await pool.query(
    `DROP TABLE IF EXISTS
       contacts,
       listing_images, listings,
       property_images, properties,
       unit_images, units, buildings,
       interests, admins, users
     CASCADE;`
  )
  console.log("✓ existing tables dropped (--reset)")
}

async function applySchemaFiles() {
  const files = (await fs.readdir(SCHEMA_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort()

  for (const file of files) {
    const sql = await fs.readFile(path.join(SCHEMA_DIR, file), "utf8")
    await pool.query(sql)
    console.log(`  ✓ ${file}`)
  }
}

async function seedAdmin() {
  const rawEmail = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!rawEmail || !password) {
    console.log("• skipping admin seed (set ADMIN_EMAIL + ADMIN_PASSWORD to seed)")
    return
  }
  const email = rawEmail.trim().toLowerCase()
  const hash = await bcrypt.hash(password, 10)
  await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email, role) DO UPDATE
       SET password_hash = EXCLUDED.password_hash`,
    [email, hash, "Primary Admin"]
  )
  console.log(`✓ admin upserted: ${email}`)
}

async function run() {
  if (RESET) await resetTables()
  console.log("Applying schema…")
  await applySchemaFiles()
  await seedAdmin()
  await pool.end()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
