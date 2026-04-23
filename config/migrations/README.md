# Migrations

Forward-only SQL migrations that preserve existing data.

## Workflow

1. **Adding a schema change**: create a new file here named `NNN_short_description.sql`
   where `NNN` is the next zero-padded 3-digit number (001, 002, …). The file
   contains `ALTER TABLE`, `UPDATE`, `INSERT`, or new `CREATE TABLE IF NOT EXISTS`
   statements — never `DROP` existing data without the user's explicit approval.

2. **Also update `config/schema/`** so fresh installs reflect the same end-state.
   Both paths must converge: fresh installs apply `schema/` + baseline
   `schema_migrations`; existing installs apply the migration.

3. Run `npm run db:migrate` to apply pending migrations against the DB indicated
   by `DB_NAME` in `.env`. Each migration runs inside a transaction.

## Tracking

`schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMP)` records every
applied migration. `markAllApplied()` in `runMigrations.js` is called by
`initDb.js` so fresh installs don't re-run migrations their `schema/` files
already embody.

## Writing a migration

```sql
-- 001_example_add_column.sql
ALTER TABLE listings ADD COLUMN IF NOT EXISTS amenities TEXT[];
UPDATE listings SET amenities = '{}' WHERE amenities IS NULL;
```

Prefer `IF NOT EXISTS` / `IF EXISTS` guards so re-running a partially-applied
migration (after a crash) doesn't trip.
