-- ============================================================
-- Migration: pos_sync_alignment
-- Date: 2026-05-03
-- Author: agent (Week 2.2 plan execution)
-- Reason: Align our schema with the real Cuci Xpress POS data after
--         analysing 129,185 rows of historical KedaiPOS exports
--         (2021-12-26 → 2026-04-30, file
--         attached_assets/Master_Data_Cuci_Xpress_Sales_(2)_*.xlsx).
--
-- Five things change here, owner-confirmed:
--
--   1) PACKAGES — replace placeholder Basic/Premium ($5..$25) with the
--      real menu: ONE package "Basic Wash" at flat BND 8.00 for every
--      car size, regardless of branch. Premium is dropped.
--
--   2) ADDONS  — replace placeholder set with the two real addons:
--      Tire Shine (+$1) and Spray Wax (+$3). The 4 placeholders from
--      2026-05-03_01 are kept in the table but marked is_active=false,
--      so any historical order that snapshotted them remains valid.
--
--   3) PAYMENT METHODS — broaden orders.payment_method CHECK to match
--      what KedaiPOS actually emits + future-proofing:
--        cash, bank_transfer, card, qr_code, baiduri_pay, quick_pay,
--        subscription, voucher
--      ('qr' is renamed to the umbrella 'qr_code'; the specific QR
--       provider goes in a new orders.qr_provider column.)
--
--   4) KEDAIPOS SYNC COLUMNS on orders — mirror the fields KedaiPOS
--      exports so Month-3 historical backfill and the live two-way
--      sync (planned) can land cleanly without losing data:
--        kedaipos_id, kedaipos_order_number, kedaipos_pos_name,
--        original_receipt_no, customer_name_walkin, qr_provider,
--        service_charge_cents, tax_cents, discount_cents,
--        promo_discount_cents, paid_amount_cents, change_cents,
--        order_notes, item_notes
--      All default 0 / NULL so existing rows (none in prod yet, but
--      principle stands) are unaffected.
--
--   5) PANDAN BRANCH — explicitly NOT added (owner: closed/planned only).
--
-- Idempotent: all DDL uses IF (NOT) EXISTS or IF EXISTS; all seeds use
--             ON CONFLICT or are wrapped in UPDATE statements that are
--             safe to re-run.
-- Forward-only: no DOWN section.
-- Touches: 1 altered table (orders), 3 reseeded tables (packages,
--          package_pricing, addons_catalog).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Packages — keep pkg_basic (correct its description+duration),
--    drop pkg_premium (was placeholder; owner has only one package).
--    Refresh basic-wash duration to a more realistic 10 min.
-- ------------------------------------------------------------
INSERT INTO packages (id, name, description, duration_minutes, sort_order)
VALUES (
  'pkg_basic',
  'Basic Wash',
  'Standard exterior wash. Flat price for every car size. Add Tire Shine or Spray Wax at the lane.',
  10,
  10
)
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  duration_minutes = EXCLUDED.duration_minutes,
  sort_order       = EXCLUDED.sort_order,
  is_active        = true;

-- Remove the placeholder Premium package and any pricing that points at it.
-- orders.package_id has no FK, so historical snapshots are unaffected.
DELETE FROM package_pricing WHERE package_id = 'pkg_premium';
DELETE FROM packages         WHERE id          = 'pkg_premium';

-- ------------------------------------------------------------
-- 2. Package pricing — flat BND 8.00 for every vehicle size,
--    branch_id = NULL (applies to every branch). Re-seed by
--    deleting and reinserting the global rows for pkg_basic;
--    branch overrides (none today) are preserved by the WHERE.
-- ------------------------------------------------------------
DELETE FROM package_pricing
 WHERE package_id = 'pkg_basic'
   AND branch_id IS NULL;

INSERT INTO package_pricing (package_id, vehicle_size, branch_id, price_cents, is_active)
VALUES
  ('pkg_basic', 'small',  NULL, 800, true),
  ('pkg_basic', 'medium', NULL, 800, true),
  ('pkg_basic', 'large',  NULL, 800, true),
  ('pkg_basic', 'xlarge', NULL, 800, true);

-- ------------------------------------------------------------
-- 3. Addons — real menu is just two: Tire Shine $1, Spray Wax $3.
--    Mark the 4 placeholders inactive so they vanish from the POS
--    but stay referenceable by any historical order snapshot.
-- ------------------------------------------------------------
UPDATE addons_catalog
   SET is_active = false
 WHERE id IN ('addon_dashboard', 'addon_vacuum', 'addon_engine_bay');

-- Refresh tire shine to its real price ($2.00 → $1.00) and ordering.
INSERT INTO addons_catalog (id, name, price_cents, sort_order, is_active)
VALUES ('addon_tire_shine', 'Tire Shine', 100, 10, true)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  sort_order  = EXCLUDED.sort_order,
  is_active   = true;

-- Add the second real addon.
INSERT INTO addons_catalog (id, name, price_cents, sort_order, is_active)
VALUES ('addon_spray_wax', 'Spray Wax', 300, 20, true)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  sort_order  = EXCLUDED.sort_order,
  is_active   = true;

-- ------------------------------------------------------------
-- 4. Broaden orders.payment_method CHECK
--    Current allowed:  cash, card, qr, subscription, voucher
--    New allowed:      cash, bank_transfer, card, qr_code,
--                      baiduri_pay, quick_pay, subscription, voucher
--    Migrate any existing rows where payment_method='qr' → 'qr_code'
--    (none in prod today, but safe).
-- ------------------------------------------------------------
UPDATE orders
   SET payment_method = 'qr_code'
 WHERE payment_method = 'qr';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD  CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN (
    'cash',
    'bank_transfer',
    'card',
    'qr_code',
    'baiduri_pay',
    'quick_pay',
    'subscription',
    'voucher'
  ));

-- ------------------------------------------------------------
-- 5. KedaiPOS sync columns + extended payment columns on orders
--    All NULL/0 default. NOT NULL only where a default exists.
-- ------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kedaipos_id           text,
  ADD COLUMN IF NOT EXISTS kedaipos_order_number text,
  ADD COLUMN IF NOT EXISTS kedaipos_pos_name     text,
  ADD COLUMN IF NOT EXISTS original_receipt_no   text,
  ADD COLUMN IF NOT EXISTS customer_name_walkin  text,
  ADD COLUMN IF NOT EXISTS qr_provider           text,
  ADD COLUMN IF NOT EXISTS service_charge_cents  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_cents             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_cents        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_discount_cents  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount_cents     integer,
  ADD COLUMN IF NOT EXISTS change_cents          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_notes           text,
  ADD COLUMN IF NOT EXISTS item_notes            text;

-- Sanity: monetary columns must be non-negative (qr_provider is free text;
-- discount_cents stores absolute magnitude — KedaiPOS used negative values
-- only in 2 historical rows, which our backfill will normalise to positive).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_charge_cents_nonneg;
ALTER TABLE orders ADD  CONSTRAINT orders_service_charge_cents_nonneg
  CHECK (service_charge_cents >= 0);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_tax_cents_nonneg;
ALTER TABLE orders ADD  CONSTRAINT orders_tax_cents_nonneg
  CHECK (tax_cents >= 0);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_cents_nonneg;
ALTER TABLE orders ADD  CONSTRAINT orders_discount_cents_nonneg
  CHECK (discount_cents >= 0);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_promo_discount_cents_nonneg;
ALTER TABLE orders ADD  CONSTRAINT orders_promo_discount_cents_nonneg
  CHECK (promo_discount_cents >= 0);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_change_cents_nonneg;
ALTER TABLE orders ADD  CONSTRAINT orders_change_cents_nonneg
  CHECK (change_cents >= 0);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_paid_amount_cents_nonneg;
ALTER TABLE orders ADD  CONSTRAINT orders_paid_amount_cents_nonneg
  CHECK (paid_amount_cents IS NULL OR paid_amount_cents >= 0);

-- ------------------------------------------------------------
-- 6. Indexes for the KedaiPOS sync path
--    - kedaipos_id is the natural key in their export (the integer "ID"
--      column). Must be unique when present, NULL allowed for orders
--      created in our app that haven't been synced yet.
--    - kedaipos_order_number ("76-1000") is queried by support staff
--      when looking up a paper receipt; not unique (refunds reuse
--      via original_receipt_no chain).
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS orders_kedaipos_id_uniq
  ON orders(kedaipos_id)
  WHERE kedaipos_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_kedaipos_order_number_idx
  ON orders(kedaipos_order_number)
  WHERE kedaipos_order_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_original_receipt_no_idx
  ON orders(original_receipt_no)
  WHERE original_receipt_no IS NOT NULL;

COMMIT;

-- ============================================================
-- Post-apply verification (run manually after applying):
--
--   -- packages: 1 row, pkg_basic only, active
--   SELECT id, name, is_active FROM packages ORDER BY id;
--
--   -- pricing: 4 rows, all 800 cents, branch_id NULL
--   SELECT vehicle_size, branch_id, price_cents, is_active
--     FROM package_pricing WHERE package_id='pkg_basic'
--     ORDER BY vehicle_size;
--
--   -- addons: 5 rows total, 2 active (tire_shine 100, spray_wax 300)
--   SELECT id, name, price_cents, is_active FROM addons_catalog
--     ORDER BY is_active DESC, sort_order;
--
--   -- orders payment check accepts new values
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'orders_payment_method_check';
--
--   -- orders has the 14 new columns
--   \d orders
--
--   -- new indexes exist
--   SELECT indexname FROM pg_indexes
--    WHERE tablename='orders' AND indexname LIKE '%kedaipos%';
-- ============================================================
