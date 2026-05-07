-- ============================================================================
-- 2026-05-07_01: SharePoint sales outbox
--
-- Goal: every reportable order (POS sale, web checkout that resolved to
-- paid/queued, free-wash voucher redemption, and refund) lands as a
-- pending row in `sharepoint_outbox`. A background worker drains the
-- queue and appends rows into the SharePoint Excel master file via
-- Microsoft Graph (/workbook/tables/{Table1}/rows/add). Power BI
-- continues to bind to the same table — no Power BI changes needed.
--
-- Architecture choice: trigger-based enqueue, NOT route-based. The 4
-- spots in server/routes.ts that touch order status (POS create, web
-- checkout paid->queued via verify-qr, loyalty voucher, refund) all
-- flow through `orders` row writes, so a single AFTER INSERT/UPDATE
-- trigger catches them atomically with the originating transaction.
-- If the trigger insert fails the order also rolls back, but it can't
-- realistically fail (single insert into a table with no FKs to user
-- data). The Graph API call lives entirely outside the order
-- transaction — POS never blocks on SharePoint.
--
-- Rows we enqueue:
--   * INSERT into orders WHERE NEW.status IN ('paid','queued')
--       op = 'sale'
--   * UPDATE orders WHERE OLD.status = 'pending_payment'
--                     AND NEW.status IN ('paid','queued')
--       op = 'sale'   (web checkout that just got paid)
--   * UPDATE orders WHERE OLD.status <> 'refunded'
--                     AND NEW.status  = 'refunded'
--       op = 'refund' (a second row appended to Excel — matches the
--                      KedaiPOS export convention of one row per event)
--
-- Numbering: a dedicated sequence `cucixpress_order_seq` produces the
-- "CX-N" identifier written into Excel column J (Order Number). It is
-- assigned at enqueue time so refund rows can reference the original
-- CX-N via Excel column I (Original Receipt No). The mapping
-- (orders.id <-> CX-N) is stored on the outbox row, NOT on orders, to
-- keep this strictly an integration concern.
-- ============================================================================

BEGIN;

-- 1. Sequence backing the "CX-N" identifier.
CREATE SEQUENCE IF NOT EXISTS cucixpress_order_seq START 1 INCREMENT 1;

-- 2. The outbox itself.
CREATE TABLE IF NOT EXISTS sharepoint_outbox (
  id            bigserial PRIMARY KEY,
  order_id      text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  op            text NOT NULL CHECK (op IN ('sale','refund')),
  cx_number     text NOT NULL,                    -- e.g. "CX-1" written to col J
  status        text NOT NULL DEFAULT 'pending'   -- 'pending' | 'sent' | 'failed'
                  CHECK (status IN ('pending','sent','failed')),
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  excel_row_id  text,                             -- populated on success (Graph row index)
  enqueued_at   timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);

-- Pull pending work efficiently. SKIP LOCKED in the worker means many
-- workers can drain in parallel without blocking each other.
CREATE INDEX IF NOT EXISTS sharepoint_outbox_pending_idx
  ON sharepoint_outbox (next_attempt_at)
  WHERE status = 'pending';

-- For the admin "recent activity" panel.
CREATE INDEX IF NOT EXISTS sharepoint_outbox_recent_idx
  ON sharepoint_outbox (enqueued_at DESC);

-- For refund row -> original sale row lookup.
CREATE INDEX IF NOT EXISTS sharepoint_outbox_order_idx
  ON sharepoint_outbox (order_id, op);

-- 3. Trigger function. Allocates a CX-N (per op) and enqueues.
CREATE OR REPLACE FUNCTION sharepoint_outbox_enqueue() RETURNS trigger AS $$
DECLARE
  v_op       text;
  v_cx       text;
  v_orig_cx  text;
BEGIN
  -- Decide whether this transition is reportable.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('paid','queued') THEN
      v_op := 'sale';
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Web checkout just got paid (pending_payment -> paid|queued).
    IF OLD.status = 'pending_payment' AND NEW.status IN ('paid','queued') THEN
      v_op := 'sale';
    -- Order just got refunded.
    ELSIF OLD.status <> 'refunded' AND NEW.status = 'refunded' THEN
      v_op := 'refund';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Refunds reuse the original sale's CX-N as the "Original Receipt No"
  -- column. The new outbox row gets its own CX-N for the refund line.
  v_cx := 'CX-' || nextval('cucixpress_order_seq')::text;

  INSERT INTO sharepoint_outbox (order_id, op, cx_number)
  VALUES (NEW.id, v_op, v_cx);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Wire the trigger.
DROP TRIGGER IF EXISTS sharepoint_outbox_trg ON orders;
CREATE TRIGGER sharepoint_outbox_trg
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION sharepoint_outbox_enqueue();

COMMIT;
