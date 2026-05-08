-- ============================================================================
-- 2026-05-08_01 — Legacy history backfill + VIP tiers
--
-- Adds the columns needed to:
--   1. Import historical sales rows from the SharePoint master Excel into
--      `orders` without colliding with new POS sales (idempotency keys).
--   2. Cache per-car visit count + lifetime spend so the POS plate-lookup
--      panel renders in <50ms instead of doing COUNT(*) on every keystroke.
--   3. Tag each car with a VIP tier (gold / silver / bronze) computed
--      offline by scripts/recompute_vip_tiers.ts, ranked by visit count.
-- ============================================================================

-- --- ORDERS: legacy provenance --------------------------------------------
-- `legacy_source` marks where a row came from. NULL = native POS sale.
-- `legacy_source_row_number` is the source Excel data-row number (1-based,
-- excluding the header). Together with `legacy_source` it forms a unique
-- key so re-running the importer is a no-op.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS legacy_source            text,
  ADD COLUMN IF NOT EXISTS legacy_source_row_number integer;

CREATE UNIQUE INDEX IF NOT EXISTS orders_legacy_dedupe_uniq
  ON orders (legacy_source, legacy_source_row_number)
  WHERE legacy_source IS NOT NULL;

-- --- CARS: cached stats + VIP tier ----------------------------------------
ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS total_visits      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_tier          text,
  ADD COLUMN IF NOT EXISTS vip_rank          integer;

ALTER TABLE cars
  DROP CONSTRAINT IF EXISTS cars_vip_tier_check;
ALTER TABLE cars
  ADD CONSTRAINT cars_vip_tier_check
  CHECK (vip_tier IS NULL OR vip_tier IN ('gold', 'silver', 'bronze'));

CREATE INDEX IF NOT EXISTS cars_vip_tier_idx ON cars (vip_tier) WHERE vip_tier IS NOT NULL;
