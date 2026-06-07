-- Add an optional category to add-ons so the POS can group them (e.g.
-- "Vouchers", "Accessories"), mirroring packages.category_id. NULL =
-- Uncategorised. FK ON DELETE SET NULL so deleting a category just leaves
-- the add-on uncategorised (matches the packages behaviour).
ALTER TABLE addons_catalog
  ADD COLUMN IF NOT EXISTS category_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'addons_catalog_category_id_fkey'
  ) THEN
    ALTER TABLE addons_catalog
      ADD CONSTRAINT addons_catalog_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
  END IF;
END $$;
