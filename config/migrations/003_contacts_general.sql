-- Allow contact rows with no listing/property (general "contact us" form
-- submissions). The original CHECK required exactly one target; relax it to
-- "not both at once" so neither is also valid. Add a subject column for the
-- general flow.

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'contacts'::regclass AND contype = 'c'
  LOOP
    EXECUTE 'ALTER TABLE contacts DROP CONSTRAINT ' || quote_ident(c);
  END LOOP;
END $$;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_target_not_both
  CHECK (NOT (listing_id IS NOT NULL AND property_id IS NOT NULL));

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS subject TEXT;
