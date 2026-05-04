-- ============================================================
-- Phase 12a: web checkout → CRM wiring.
--
-- Background: until now, when a customer paid online via the
-- /checkout flow we sent them to Pocket Pay but wrote NOTHING
-- to our DB. /api/save-customer was a console.log no-op. Result:
-- staff couldn't see prepaid orders in the POS; the customer
-- dashboard's wash history showed only in-store walk-ins;
-- memberships, loyalty, CRM — all blind to online payments.
--
-- This migration unblocks /api/process-payment to write the
-- order row at link-creation time as `status='pending_payment'`,
-- and lets /api/payment-callback flip it to `'paid'` (or
-- `'voided'`) when Pocket Pay confirms.
--
-- Three changes, all small and reversible-by-new-migration:
--
--   1. Allow the new 'pending_payment' status in orders.status.
--      No other status semantics change.
--   2. Drop NOT NULL on orders.ticket_code so a pending-payment
--      row (which has no lane ticket yet) can exist. Staff
--      allocates the T-NNN ticket at scan-in time, same as today.
--      The existing UNIQUE INDEX on (branch_id, ticket_code,
--      ticket_day) already permits multiple NULLs (Postgres
--      btree default).
--   3. Add a partial UNIQUE index on payment_ref for Pocket Pay
--      rows so the callback is idempotent — a Pocket Pay
--      order_id maps to at most one orders row. Cash/card
--      payment_refs (KedaiPOS receipt numbers etc.) are NOT
--      gated by the index because qr_provider != 'pocket_pay'.
-- ============================================================

BEGIN;

-- (1) Allow pending_payment alongside the existing six.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD  CONSTRAINT          orders_status_check
  CHECK (status IN (
    'pending_payment',  -- 12a: web checkout, awaiting Pocket Pay callback
    'paid',
    'queued',
    'washing',
    'done',
    'voided',
    'refunded'
  ));

-- (2) ticket_code nullable for pending_payment rows.
ALTER TABLE orders ALTER COLUMN ticket_code DROP NOT NULL;

-- (3) Idempotency for Pocket Pay callbacks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_pocket_pay_payment_ref
  ON orders (payment_ref)
  WHERE qr_provider = 'pocket_pay' AND payment_ref IS NOT NULL;

COMMIT;
