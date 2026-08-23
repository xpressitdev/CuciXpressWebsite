-- Audited transfer of one qualifying digital loyalty wash to a physical card.
--
-- A paid B$12 wash is digital by default. An active row in this table moves
-- exactly that order out of the digital punch card without changing the sale
-- or overloading orders.loyalty_consumed_in (which remains reserved for a
-- digital free-wash redemption).
--
-- Reversals update the original row instead of deleting it, retaining who
-- transferred/reversed the wash and why. A used physical-card entry can never
-- be reversed. The partial unique index permits a later corrected re-transfer
-- after a reversal while preventing two active transfers for one order.
--
-- Idempotent: safe to re-run on development/staging/production.

CREATE TABLE IF NOT EXISTS loyalty_physical_card_transfers (
  id                       text PRIMARY KEY,
  order_id                 text NOT NULL REFERENCES orders(id),
  transferred_at           timestamptz NOT NULL DEFAULT now(),
  transferred_by_staff_id  text NOT NULL REFERENCES staff(id),
  note                     text,
  physical_card_reference  text,
  used_at                  timestamptz,
  used_by_staff_id         text REFERENCES staff(id),
  use_note                 text,
  reversed_at              timestamptz,
  reversed_by_staff_id     text REFERENCES staff(id),
  reversal_note            text,
  CONSTRAINT loyalty_physical_transfer_used_pair_check
    CHECK (
      (used_at IS NULL AND used_by_staff_id IS NULL)
      OR (used_at IS NOT NULL AND used_by_staff_id IS NOT NULL)
    ),
  CONSTRAINT loyalty_physical_transfer_reversed_pair_check
    CHECK (
      (reversed_at IS NULL AND reversed_by_staff_id IS NULL)
      OR (reversed_at IS NOT NULL AND reversed_by_staff_id IS NOT NULL)
    ),
  CONSTRAINT loyalty_physical_transfer_terminal_state_check
    CHECK (NOT (used_at IS NOT NULL AND reversed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_physical_card_transfers_active_order_uidx
  ON loyalty_physical_card_transfers (order_id)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS loyalty_physical_card_transfers_order_idx
  ON loyalty_physical_card_transfers (order_id);

CREATE INDEX IF NOT EXISTS loyalty_physical_card_transfers_transferred_at_idx
  ON loyalty_physical_card_transfers (transferred_at DESC);