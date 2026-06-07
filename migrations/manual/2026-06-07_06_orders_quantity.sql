-- 2026-06-07_06: Order line quantity.
-- Adds a unit multiplier to orders so cashiers can sell several of the same
-- package in one transaction (e.g. a bulk wash-voucher sale). Defaults to 1,
-- so all existing rows and single-wash paths are unaffected.
-- subtotal_cents = (package + add-ons) * quantity.
-- Idempotent: safe to re-run.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
