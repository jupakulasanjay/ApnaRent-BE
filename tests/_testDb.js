import "dotenv/config"
import pkg from "pg"
const { Client } = pkg

export const TEST_DB_NAME = "apnarent_test"

// Connects to the default 'postgres' maintenance DB and creates apnarent_test
// if it doesn't exist. Called once per test file's before() hook.
export async function ensureTestDatabase() {
  const client = new Client({
    user:     process.env.DB_USER,
    host:     process.env.DB_HOST,
    database: "postgres",
    password: process.env.DB_PASSWORD,
    port:     process.env.DB_PORT
  })
  await client.connect()
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [TEST_DB_NAME]
    )
    if (rows.length === 0) {
      await client.query(`CREATE DATABASE ${TEST_DB_NAME}`)
    }
  } finally {
    await client.end()
  }
}
