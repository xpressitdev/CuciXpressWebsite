-- ============================================================
-- Phase 4: Order refunds.
--
-- Decisions (confirmed with owner 2026-05-04):
--   * ANY staff can issue a refund (no manager PIN gate).
--   * Refund is FULL ORDER ONLY — no partials, no per-addon
--     refunds. Keeps reconciliation simple.
--   * Subscription/membership orders: do NOT restore the wash.
--     The membership_redemptions row stays, remaining_washes
--     stays decremented. Refund only voids the order line for
--     reporting; it doesn't credit the pack back.
--   * Refunds appear as NEGATIVE entries in the today's-orders
--     feed (handled in the client; the row's status flips to
--     'refunded' and the UI displays -B$X.XX).
--
-- Schema-wise this is a tiny extension of `orders`:
--   * `refunded_at`             — when the refund was issued
--   * `refunded_by_staff_id`    — who issued it
--   * `refund_reason`           — optional free-text from staff
--
-- The existing `orders_status_check` is replaced to allow the
-- new 'refunded' status alongside the existing five.
-- ============================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_at           timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by_staff_id  text REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS refund_reason         text;

-- Replace the status CHECK to permit 'refunded'. Confirmed name
-- via pg_constraint inspection — Postgres auto-named the inline
-- CHECK when the table was created in 2026-05-02_01.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD  CONSTRAINT          orders_status_check
  CHECK (status IN ('paid', 'queued', 'washing', 'done', 'voided', 'refunded'));

-- Integrity: a refund must populate both the timestamp and the
-- issuing staff. Reason is optional. Non-refund rows keep both
-- as NULL. (Cannot be folded into the status CHECK because
-- staff_id reference can't sit in a CHECK predicate.)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_refund_fields_consistent;
ALTER TABLE orders ADD  CONSTRAINT          orders_refund_fields_consistent
  CHECK (
    (status = 'refunded' AND refunded_at IS NOT NULL AND refunded_by_staff_id IS NOT NULL)
    OR
    (status <> 'refunded' AND refunded_at IS NULL AND refunded_by_staff_id IS NULL AND refund_reason IS NULL)
  );

-- Reporting: "show me today's refunds at branch X" is the only
-- planned read pattern. Tiny partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS idx_orders_refunded_at
  ON orders (branch_id, refunded_at DESC)
  WHERE status = 'refunded';

COMMIT;
