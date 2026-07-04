-- ============================================================================
-- 2026-07-03_01: SharePoint outbox — report prepaid-QR washes at CLAIM, not payment
--
-- Problem: prepaid-QR orders (Unlimited Xpress subscription = qr_provider
-- 'membership', online web checkout = 'pocket_pay', free-wash voucher =
-- 'loyalty') are created/paid BEFORE the car reaches a lane, so their
-- branch_id is still NULL at that moment. The old trigger enqueued the sale
-- the instant the order became paid/queued, freezing Excel column E
-- (Store Name) as "-". The branch is only learned later when a cashier scans
-- the QR at a lane (verify-qr stamps branch_id + claimed_at) — but the Excel
-- row was already sent and never refreshed, so Power BI keeps showing "-".
--
-- Fix: for prepaid-QR orders, DEFER the sale enqueue until the wash is
-- claimed at a lane (claimed_at goes NULL -> NOT NULL), by which point
-- branch_id is populated. In-person POS orders (qr_provider NULL / other)
-- are unchanged — they still enqueue the moment they become paid/queued.
--
-- This mirrors the in-app claim-day revenue bucketing (bizDay()): a prepaid
-- wash is realized on the day/branch it is scanned, not the day it was paid.
--
-- Refunds: a prepaid order that was never claimed has no 'sale' row, so we
-- do NOT emit a 'refund' row for it either (guarded by EXISTS). In-person
-- POS refunds are unchanged.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER. The trigger
-- now also fires on UPDATE OF claimed_at so the claim event is caught.
-- Safe to run on both $DATABASE_URL and $STAGING_DATABASE_URL.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION sharepoint_outbox_enqueue() RETURNS trigger AS $$
DECLARE
  v_op       text;
  v_cx       text;
  is_prepaid boolean;
BEGIN
  -- Prepaid-QR = bought/generated ahead of the lane; branch is only known
  -- once the QR is scanned at a lane. Matches the bizDay() claim-day set.
  is_prepaid := (NEW.qr_provider IN ('membership','pocket_pay','loyalty'));

  IF TG_OP = 'INSERT' THEN
    IF is_prepaid THEN
      -- Only report on INSERT if the row is already claimed (rare: created
      -- straight into a lane). Otherwise wait for the claim UPDATE below.
      IF NEW.claimed_at IS NOT NULL
         AND NEW.status IN ('paid','queued','washing','done') THEN
        v_op := 'sale';
      ELSE
        RETURN NEW;
      END IF;
    ELSE
      -- In-person POS (unchanged): report the moment it's paid/queued.
      IF NEW.status IN ('paid','queued') THEN
        v_op := 'sale';
      ELSE
        RETURN NEW;
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF is_prepaid THEN
      -- Report the sale when the wash is claimed at a lane (claimed_at flips
      -- NULL -> set), capturing the scanning branch. NOT EXISTS keeps it
      -- idempotent and avoids a duplicate for orders already reported under
      -- the old payment-time rule.
      IF OLD.claimed_at IS NULL AND NEW.claimed_at IS NOT NULL
         AND NEW.status IN ('paid','queued','washing','done')
         AND NOT EXISTS (
           SELECT 1 FROM sharepoint_outbox WHERE order_id = NEW.id AND op = 'sale'
         ) THEN
        v_op := 'sale';
      -- Refund only mirrors a sale we actually reported.
      ELSIF OLD.status <> 'refunded' AND NEW.status = 'refunded'
            AND EXISTS (
              SELECT 1 FROM sharepoint_outbox WHERE order_id = NEW.id AND op = 'sale'
            ) THEN
        v_op := 'refund';
      ELSE
        RETURN NEW;
      END IF;
    ELSE
      -- In-person POS (unchanged).
      IF OLD.status = 'pending_payment' AND NEW.status IN ('paid','queued') THEN
        v_op := 'sale';
      ELSIF OLD.status <> 'refunded' AND NEW.status = 'refunded' THEN
        v_op := 'refund';
      ELSE
        RETURN NEW;
      END IF;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  v_cx := 'CX-' || nextval('cucixpress_order_seq')::text;

  INSERT INTO sharepoint_outbox (order_id, op, cx_number)
  VALUES (NEW.id, v_op, v_cx);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-wire: also fire on claimed_at so the claim event is caught for prepaid rows.
DROP TRIGGER IF EXISTS sharepoint_outbox_trg ON orders;
CREATE TRIGGER sharepoint_outbox_trg
  AFTER INSERT OR UPDATE OF status, claimed_at ON orders
  FOR EACH ROW
  EXECUTE FUNCTION sharepoint_outbox_enqueue();

COMMIT;
