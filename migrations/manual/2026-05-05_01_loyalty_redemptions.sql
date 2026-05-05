-- ============================================================
-- Phase 12f: punch-card loyalty.
--
-- Promo: "collect 4 receipts of the B$12 package
-- (pkg_basic_tyre_wax) and redeem 1 free B$12 wash."
--
-- Two changes:
--   1. orders.loyalty_consumed_in (TEXT, FK to loyalty_redemptions.id,
--      nullable). When a qualifying receipt is "punched" toward a
--      free-wash redemption, this column points at that redemption.
--      An order may be consumed at most once.
--   2. loyalty_redemptions table — one row per free-wash issuance.
--      Links the 4 consumed orders to the issued voucher order.
--
-- Voucher orders use existing schema:
--   payment_method = 'voucher' (already in the orders_payment_method_check)
--   qr_provider    = 'loyalty'
--   total_cents    = 0
--   status         = 'paid'   (so /api/verify-qr can flip to 'queued')
--
-- /api/verify-qr is widened in this phase to accept both
-- qr_provider IN ('pocket_pay','loyalty').
-- ============================================================

BEGIN;

-- (1) The redemption ledger.
CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id                TEXT PRIMARY KEY,
  customer_user_id  INTEGER NOT NULL REFERENCES users(id),
  voucher_order_id  TEXT    NOT NULL REFERENCES orders(id),
  package_id        TEXT    NOT NULL,
  branch_id         INTEGER NOT NULL REFERENCES branches(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user
  ON loyalty_redemptions (customer_user_id, created_at DESC);

-- One voucher per redemption (defensive — also enforced in code).
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_redemptions_voucher
  ON loyalty_redemptions (voucher_order_id);

-- (2) Punch tracker on orders.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS loyalty_consumed_in TEXT
    REFERENCES loyalty_redemptions(id);

CREATE INDEX IF NOT EXISTS idx_orders_loyalty_eligible
  ON orders (customer_id, package_id)
  WHERE loyalty_consumed_in IS NULL
    AND status IN ('paid','queued','washing','done');

COMMIT;
