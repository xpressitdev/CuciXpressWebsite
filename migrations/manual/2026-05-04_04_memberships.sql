-- ============================================================
-- Phase 2: Memberships (prepaid wash-pack model, BND).
--
-- Cuci Xpress sells "wash-pack" memberships: a customer pays
-- upfront for N washes (typical: 10) and redeems them at the
-- POS over time. The pack:
--   * is owned by a customer (customers.id),
--   * MAY be pinned to a specific vehicle (cars.id) — optional,
--     so a household with two cars can share one pack,
--   * tracks total + remaining washes (the "punch card"),
--   * snapshots BND price paid at the time of sale,
--   * tracks WHO sold it (staff) and WHERE (branch) for audit,
--   * may have an expiry (nullable; null = no expiry).
--
-- A redemption is a row in `membership_redemptions` linking the
-- membership to the order that consumed a wash. We never modify
-- the order itself after redemption — the audit trail lives in
-- this side table. `orders.payment_method = 'subscription'` and
-- `orders.discount_cents = subtotal_cents` (full discount) are
-- the on-order signals; the redemption row is the auditable proof.
--
-- This migration also drops the unused stub `subscriptions` table
-- (0 rows in prod, 0 rows in staging — confirmed pre-migration).
-- It modelled an unrelated "monthly unlimited" product that the
-- business does NOT sell. Replacing the abstraction outright is
-- cleaner than coercing the schema.
-- ============================================================

BEGIN;

-- 1. Drop the unused stub. Asserts row count is zero so we can't
--    accidentally clobber real data if a future seed sneaks in.
DO $mig$
DECLARE n int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'subscriptions'
  ) THEN
    EXECUTE 'SELECT COUNT(*) FROM subscriptions' INTO n;
    IF n <> 0 THEN
      RAISE EXCEPTION 'Refusing to drop subscriptions: % rows present', n;
    END IF;
    DROP TABLE subscriptions;
  END IF;
END
$mig$;

-- 2. memberships — the wash-pack itself.
CREATE TABLE IF NOT EXISTS memberships (
  id                 text PRIMARY KEY,
  customer_id        integer NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_id         integer          REFERENCES cars(id)      ON DELETE SET NULL,
  total_washes       integer NOT NULL,
  remaining_washes   integer NOT NULL,
  price_cents        integer NOT NULL,
  status             text    NOT NULL DEFAULT 'active',
  expires_at         timestamptz,
  sold_by_staff_id   text    NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  sold_at_branch_id  integer NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_total_positive       CHECK (total_washes > 0),
  CONSTRAINT memberships_remaining_nonneg     CHECK (remaining_washes >= 0),
  CONSTRAINT memberships_remaining_le_total   CHECK (remaining_washes <= total_washes),
  CONSTRAINT memberships_status_valid         CHECK (status IN ('active', 'exhausted', 'expired', 'cancelled'))
);

-- Lookup paths:
--   * "is there an active pack for this customer?" → (customer_id, status)
--   * "is there an active pack pinned to this car?" → (vehicle_id, status)
--   * "list packs sold at this branch in date X" → (sold_at_branch_id, created_at)
CREATE INDEX IF NOT EXISTS memberships_customer_status_idx
  ON memberships(customer_id, status);
CREATE INDEX IF NOT EXISTS memberships_vehicle_status_idx
  ON memberships(vehicle_id, status) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memberships_branch_created_idx
  ON memberships(sold_at_branch_id, created_at DESC);

-- 3. membership_redemptions — one row per wash consumed.
CREATE TABLE IF NOT EXISTS membership_redemptions (
  id             text PRIMARY KEY,
  membership_id  text    NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
  order_id       text    NOT NULL REFERENCES orders(id)      ON DELETE RESTRICT,
  staff_id       text    NOT NULL REFERENCES staff(id)       ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- An order can only be the redemption target of ONE membership.
-- If a future bug tries to double-redeem, the unique index stops it.
CREATE UNIQUE INDEX IF NOT EXISTS membership_redemptions_order_uniq
  ON membership_redemptions(order_id);
CREATE INDEX IF NOT EXISTS membership_redemptions_membership_idx
  ON membership_redemptions(membership_id, created_at DESC);

COMMIT;
