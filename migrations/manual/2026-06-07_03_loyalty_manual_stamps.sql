-- Cashier-credited loyalty stamps (digital-receipt migration backstop).
--
-- When the digital "collect 4 × B$12 → free wash" punch card goes live,
-- past sales already in the system auto-count by plate. But some plates'
-- physical paper receipts won't auto-count (plate typo, walk-in plate not
-- captured, or collected under a slightly different plate). A branch-locked
-- cashier verifies the paper receipts and credits the matching number of
-- stamps to the plate via this table.
--
-- Each row is one credit of `stamps_total`; redemption decrements
-- `stamps_remaining` (mirrors memberships.remaining_washes). Stamps attach
-- to a car by vehicle_id when one exists, else by the normalised plate —
-- the same per-plate attribution the customer loyalty card uses.
--
-- staff_id / branch_id / note / receipt_no are the audit trail (who added
-- the stamps, where, why, and the optional physical receipt number).
--
-- Idempotent: safe to re-run on dev/prod/staging.

CREATE TABLE IF NOT EXISTS loyalty_manual_stamps (
  id               text PRIMARY KEY,
  vehicle_id       integer REFERENCES cars(id),
  plate            text NOT NULL,
  plate_norm       text NOT NULL,
  stamps_total     integer NOT NULL,
  stamps_remaining integer NOT NULL,
  note             text,
  receipt_no       text,
  branch_id        integer REFERENCES branches(id),
  staff_id         text NOT NULL REFERENCES staff(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Lookups are by normalised plate (cashier types a plate) and by vehicle_id
-- (customer loyalty card join). Index both, plus a partial index for the
-- "still has remaining" rows we sum at count/redeem time.
CREATE INDEX IF NOT EXISTS loyalty_manual_stamps_plate_norm_idx
  ON loyalty_manual_stamps (plate_norm);
CREATE INDEX IF NOT EXISTS loyalty_manual_stamps_vehicle_id_idx
  ON loyalty_manual_stamps (vehicle_id);
CREATE INDEX IF NOT EXISTS loyalty_manual_stamps_remaining_idx
  ON loyalty_manual_stamps (stamps_remaining) WHERE stamps_remaining > 0;
