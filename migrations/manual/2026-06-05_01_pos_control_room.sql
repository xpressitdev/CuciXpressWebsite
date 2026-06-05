-- ============================================================
-- Migration: pos_control_room (Task #7)
-- Date: 2026-06-05
-- Reason: Turn the Admin dashboard into a full management back end.
--         Adds owner-managed Categories, Discounts, Promo codes and
--         Payment-method config. Discounts / promo codes / payment
--         methods drive the POS checkout.
--
-- Tables added:  categories, discounts, promo_codes, payment_methods
-- Columns added: packages.category_id
--                orders.discount_id, orders.promo_code_id
--
-- Idempotent: all DDL uses IF (NOT) EXISTS; seeds use ON CONFLICT.
-- Forward-only: no DOWN section. Shared dev=prod DB — no test data.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Categories — group POS packages in the product grid.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- packages.category_id — nullable, NULL = "Uncategorised".
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS category_id text;

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_category_id_fkey;
ALTER TABLE packages
  ADD CONSTRAINT packages_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS packages_category_id_idx ON packages(category_id);

-- ------------------------------------------------------------
-- 2. Discounts — cashier-applied at checkout.
--    kind='percent' → value is whole percent 1-100.
--    kind='fixed'   → value is BND cents.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discounts (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  kind        text NOT NULL,
  value       integer NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_kind_check;
ALTER TABLE discounts ADD CONSTRAINT discounts_kind_check
  CHECK (kind IN ('percent', 'fixed'));

ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_value_check;
ALTER TABLE discounts ADD CONSTRAINT discounts_value_check
  CHECK (
    (kind = 'percent' AND value BETWEEN 1 AND 100) OR
    (kind = 'fixed'   AND value >= 0)
  );

-- ------------------------------------------------------------
-- 3. Promo codes — customer-entered at checkout. Optional date
--    window + usage cap. Same value semantics as discounts.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_codes (
  id          text PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  kind        text NOT NULL,
  value       integer NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  starts_at   timestamptz,
  expires_at  timestamptz,
  max_uses    integer,
  used_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_kind_check;
ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_kind_check
  CHECK (kind IN ('percent', 'fixed'));

ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_value_check;
ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_value_check
  CHECK (
    (kind = 'percent' AND value BETWEEN 1 AND 100) OR
    (kind = 'fixed'   AND value >= 0)
  );

ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_used_count_check;
ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_used_count_check
  CHECK (used_count >= 0);

-- ------------------------------------------------------------
-- 4. Payment methods — presentation/config layer over the fixed
--    orders.payment_method CHECK codes. `method` is the underlying
--    code; `qr_provider` discriminates wallet methods (method='qr_code').
--    is_system rows can't be hard-deleted by the UI.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_methods (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  method      text NOT NULL,
  qr_provider text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Underlying code must be one of the allowed orders.payment_method values.
ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS payment_methods_method_check;
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_method_check
  CHECK (method IN (
    'cash', 'bank_transfer', 'card', 'qr_code',
    'baiduri_pay', 'quick_pay', 'subscription', 'voucher'
  ));

-- 'pocket_pay' is reserved for the online Pocket Pay callback idempotency
-- index — manual POS must never use it. Block it at the config layer too.
ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS payment_methods_provider_reserved_check;
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_provider_reserved_check
  CHECK (qr_provider IS NULL OR qr_provider <> 'pocket_pay');

-- One config row per (method, qr_provider) pair.
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_method_provider_uniq
  ON payment_methods (method, COALESCE(qr_provider, ''));

-- Seed the current POS payment options (mirrors PAYMENT_OPTIONS in pos.tsx).
INSERT INTO payment_methods (id, label, method, qr_provider, sort_order, is_system) VALUES
  ('pm_cash',                'Cash',                        'cash',          NULL,                 10,  true),
  ('pm_card',                'Card',                        'card',          NULL,                 20,  false),
  ('pm_bank_transfer',       'Bank Transfer',               'bank_transfer', NULL,                 30,  false),
  ('pm_baiduri_pay',         'Baiduripay',                  'baiduri_pay',   NULL,                 40,  false),
  ('pm_quick_pay',           'Quickpay',                    'quick_pay',     NULL,                 50,  false),
  ('pm_pocket_pay_qr',       'Pocket Payment QR',           'qr_code',       'pocket_pay_qr',      60,  false),
  ('pm_pocket_pay_invoice',  'Pocket Payment Invoice',      'qr_code',       'pocket_pay_invoice', 70,  false),
  ('pm_baiduri_ms',          'Baiduri MS Payment Request',  'qr_code',       'baiduri_ms',         80,  false),
  ('pm_subscription',        'Subscription',                'subscription',  NULL,                 90,  true),
  ('pm_voucher',             'Voucher',                     'voucher',       NULL,                 100, true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 5. orders audit columns for the applied discount / promo.
-- ------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_id   text,
  ADD COLUMN IF NOT EXISTS promo_code_id text;

COMMIT;
