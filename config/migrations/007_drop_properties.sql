-- Hard-remove the for-sale "properties" feature: tables, foreign keys from
-- contacts/interests, and all related indexes/constraints. Forward-only; FE
-- has already moved to rentals-only.
--
-- Run with `npm run db:migrate`. Idempotent on retry.

BEGIN;

-- Purge interests rows that only pointed at a property (no listing target).
-- These rows have no meaningful home after the column drop.
DELETE FROM interests WHERE listing_id IS NULL;

-- Contacts: rows with no listing_id are kept and become general contacts
-- (which matches the new "listing-bound | general" shape).

-- contacts: drop the explicit XOR check, then the property_id column with
-- CASCADE (auto-drops idx_contacts_property and the FK).
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_target_not_both;
ALTER TABLE contacts DROP COLUMN IF EXISTS property_id CASCADE;

-- interests: drop the property_id column with CASCADE (auto-drops the XOR
-- CHECK constraint, the UNIQUE (user_id, property_id), idx_interests_property,
-- and the FK to properties).
ALTER TABLE interests DROP COLUMN IF EXISTS property_id CASCADE;

-- listing_id is the sole target now — tighten the column.
ALTER TABLE interests ALTER COLUMN listing_id SET NOT NULL;

-- Earth/btree indexes on properties go with the table.
DROP TABLE IF EXISTS property_images CASCADE;
DROP TABLE IF EXISTS properties CASCADE;

COMMIT;
