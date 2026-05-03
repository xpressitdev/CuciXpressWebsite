-- ============================================================
-- Phase 1.5 follow-up: flat per-package pricing (BND).
--
-- Cuci Xpress does NOT distinguish vehicle size when pricing —
-- the same wash costs the same whether it's a kancil or a Hilux.
-- The original schema modelled prices as a (package × vehicle_size
-- × branch) matrix in `package_pricing`; that complexity is gone.
--
-- New canonical catalogue (BND, owner-confirmed 2026-05-04):
--   - Basic Wash                                    B$8
--   - Basic Wash + Tyre Shine                       B$9
--   - Basic Wash + Spray Wax                        B$11
--   - Basic Wash + Tyre Shine + Spray Wax           B$12
--
-- This migration:
--   1. Adds `packages.price_cents` (the new canonical price column).
--   2. Backfills existing rows from package_pricing, then explicitly
--      sets pkg_basic to 800 cents.
--   3. Upserts the 3 new combo packages.
--   4. Marks price_cents NOT NULL.
--   5. Drops the `package_pricing` table — no consumer remains and
--      orders snapshot their final price into `package_price_cents`
--      so historical orders are unaffected.
--
-- Pre-state assumption: prod has 1 row in `packages` (pkg_basic) and
-- 0 rows in `orders`. The order-create path has not been used yet.
-- Idempotent: re-running on a fully-migrated DB is a no-op.
-- ============================================================

BEGIN;

-- 1. Add nullable price_cents.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_cents integer;

-- 2. Backfill from package_pricing (default-branch row only) if it still exists.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'package_pricing'
  ) THEN
    EXECUTE $sql$
      UPDATE packages p
         SET price_cents = sub.price_cents
        FROM (
          SELECT package_id, MAX(price_cents) AS price_cents
            FROM package_pricing
           WHERE branch_id IS NULL AND is_active = true
           GROUP BY package_id
        ) sub
       WHERE p.id = sub.package_id
         AND p.price_cents IS NULL
    $sql$;
  END IF;
END
$mig$;

-- 3. Canonicalise pkg_basic to the new spec (covers DBs where
--    package_pricing was empty or already dropped).
UPDATE packages
   SET price_cents = 800,
       name = 'Basic Wash',
       sort_order = 10,
       is_active = true
 WHERE id = 'pkg_basic';

-- 4. Upsert the 3 new combo packages.
INSERT INTO packages (id, name, description, duration_minutes, is_active, sort_order, price_cents)
VALUES
  ('pkg_basic_tyre',     'Basic Wash + Tyre Shine',                  NULL, NULL, true, 20,  900),
  ('pkg_basic_wax',      'Basic Wash + Spray Wax',                   NULL, NULL, true, 30, 1100),
  ('pkg_basic_tyre_wax', 'Basic Wash + Tyre Shine + Spray Wax',      NULL, NULL, true, 40, 1200)
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  duration_minutes = EXCLUDED.duration_minutes,
  is_active        = EXCLUDED.is_active,
  sort_order       = EXCLUDED.sort_order,
  price_cents      = EXCLUDED.price_cents;

-- 5. Lock down price_cents.
ALTER TABLE packages ALTER COLUMN price_cents SET NOT NULL;

-- 6. Drop the redundant pricing matrix.
DROP TABLE IF EXISTS package_pricing;

COMMIT;
