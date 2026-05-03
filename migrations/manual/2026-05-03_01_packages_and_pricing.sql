-- ============================================================
-- Migration: packages_and_pricing
-- Date: 2026-05-03
-- Author: agent (Week 2.1 plan execution)
-- Reason: Land the package catalog and per-vehicle-size pricing matrix
--         that the POS surface (Month 5) and the customer-facing landing
--         page need. Also seeds the existing addons_catalog table (added
--         empty in 2026-05-02_01) with 4 default upsells.
--
-- Idempotent: every statement uses IF NOT EXISTS or ON CONFLICT.
-- Forward-only: no DOWN section.
-- Touches: 2 new tables (packages, package_pricing) + seed rows in
--          packages, package_pricing, addons_catalog.
-- ZERO changes to any of the 17 existing tables.
--
-- Vehicle size taxonomy:
--   The existing cars.type column is free-text and contains 55 distinct
--   values today (incl. typos and a row containing "Lambak"). It is too
--   dirty to constrain against. package_pricing therefore uses its own
--   canonical 4-size enum: small | medium | large | xlarge. A future
--   migration will reconcile cars.type → vehicle_size with a lookup
--   table. Until then, the POS UI will ask staff to pick the size at
--   the lane.
--
-- Branch-specific overrides:
--   package_pricing.branch_id is NULLable. NULL means "applies to every
--   branch" (the default). A row with branch_id = N overrides the NULL
--   row for that branch. This lets us seed a uniform price list now
--   and add per-branch pricing later without schema changes.
--
-- IMPORTANT: prices below are PLACEHOLDERS. They are reasonable Brunei
-- car-wash ballparks but have NOT been confirmed by the owner. Before
-- the POS goes live in production, the owner must update these via
-- /admin or a follow-up SQL migration.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. packages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packages (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  description      text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packages_active_sort_idx
  ON packages(is_active, sort_order);

-- ------------------------------------------------------------
-- 2. package_pricing
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS package_pricing (
  id              serial PRIMARY KEY,
  package_id      text NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  vehicle_size    text NOT NULL CHECK (vehicle_size IN ('small','medium','large','xlarge')),
  branch_id       integer REFERENCES branches(id),
  price_cents     integer NOT NULL CHECK (price_cents >= 0),
  is_active       boolean NOT NULL DEFAULT true,
  effective_from  timestamptz NOT NULL DEFAULT now()
);

-- One active price per (package, vehicle_size, branch_id). NULL branch_id
-- = global default. Postgres treats NULL as distinct in UNIQUE by default,
-- which is what we want here: only one global row per (package, size),
-- and one override row per (package, size, branch).
CREATE UNIQUE INDEX IF NOT EXISTS package_pricing_unique_active_idx
  ON package_pricing(package_id, vehicle_size, COALESCE(branch_id, 0))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS package_pricing_lookup_idx
  ON package_pricing(package_id, vehicle_size, branch_id)
  WHERE is_active = true;

-- ------------------------------------------------------------
-- 3. Seed default packages
-- ------------------------------------------------------------
INSERT INTO packages (id, name, description, duration_minutes, sort_order)
VALUES
  ('pkg_basic',
   'Basic Wash',
   'Exterior rinse, foam wash, hand dry. Quick service for daily upkeep.',
   15,
   10),
  ('pkg_premium',
   'Premium Wash',
   'Full exterior wash + interior vacuum + dashboard wipe + tire shine. Recommended weekly.',
   30,
   20)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 4. Seed default pricing (BND cents; PLACEHOLDER prices)
--    branch_id = NULL  → applies to every branch
-- ------------------------------------------------------------
INSERT INTO package_pricing (package_id, vehicle_size, branch_id, price_cents)
VALUES
  -- Basic Wash
  ('pkg_basic',   'small',   NULL,  500),  -- BND 5.00
  ('pkg_basic',   'medium',  NULL,  600),  -- BND 6.00
  ('pkg_basic',   'large',   NULL,  800),  -- BND 8.00
  ('pkg_basic',   'xlarge',  NULL, 1000),  -- BND 10.00
  -- Premium Wash
  ('pkg_premium', 'small',   NULL, 1200),  -- BND 12.00
  ('pkg_premium', 'medium',  NULL, 1500),  -- BND 15.00
  ('pkg_premium', 'large',   NULL, 2000),  -- BND 20.00
  ('pkg_premium', 'xlarge',  NULL, 2500)   -- BND 25.00
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 5. Seed addons_catalog (table created empty in 2026-05-02_01)
--    PLACEHOLDER prices.
-- ------------------------------------------------------------
INSERT INTO addons_catalog (id, name, price_cents, sort_order, is_active)
VALUES
  ('addon_tire_shine',     'Tire Shine',       200, 10, true),  -- BND 2.00
  ('addon_dashboard',      'Dashboard Polish', 300, 20, true),  -- BND 3.00
  ('addon_vacuum',         'Interior Vacuum',  500, 30, true),  -- BND 5.00
  ('addon_engine_bay',     'Engine Bay Wash',  800, 40, true)   -- BND 8.00
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- Post-apply verification (run manually after applying):
--   SELECT count(*) FROM packages;          -- expected: 2
--   SELECT count(*) FROM package_pricing;   -- expected: 8
--   SELECT count(*) FROM addons_catalog;    -- expected: 4
--   \d packages
--   \d package_pricing
-- ============================================================
