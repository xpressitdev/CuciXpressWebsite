-- ============================================================
-- Phase 8: Cashier shifts (drawer reconciliation).
--
-- Goal: each cashier opens a "shift" with a declared starting
-- cash float, takes orders against it, and closes the shift at
-- end of day with a counted-cash declaration. The system then
-- computes:
--
--   expected_cash = opening_float
--                 + SUM(cash sales on this shift)
--                 - SUM(cash refunds on this shift)
--   variance     = counted_cash - expected_cash
--
-- A non-zero variance is the over/short to investigate.
--
-- Decisions (owner, 2026-05-04):
--   * One open shift per staff at a time. Enforced by a
--     partial unique index on (opened_by_staff_id) WHERE
--     status='open'.
--   * Shifts are per-staff, NOT per-branch. A cashier covering
--     two branches in one day opens two shifts.
--   * Orders are linked to a shift via a new orders.shift_id
--     column. The link is BEST-EFFORT: orders without an open
--     shift still create successfully (shift_id NULL). This
--     keeps existing flows from breaking on day one.
--   * Refunds keep the original order's shift_id — the cash
--     came back out of whichever drawer the sale went into.
--   * No automatic close. Owner can force-close from /admin
--     with a note ("Forgot to close yesterday — counted later").
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id                       BIGSERIAL PRIMARY KEY,
  branch_id                INTEGER     NOT NULL REFERENCES branches(id),
  opened_by_staff_id       TEXT        NOT NULL REFERENCES staff(id),
  closed_by_staff_id       TEXT        REFERENCES staff(id),

  opening_float_cents      INTEGER     NOT NULL,
  -- Counted cash at close. NULL while shift is open.
  closing_counted_cents    INTEGER,
  -- Computed at close time and persisted for audit (so reports
  -- aren't sensitive to later edits/refunds against the shift).
  closing_expected_cents   INTEGER,
  closing_variance_cents   INTEGER,    -- counted - expected; NULL while open

  opening_note             TEXT,
  closing_note             TEXT,

  status                   TEXT        NOT NULL DEFAULT 'open',
  opened_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at                TIMESTAMPTZ,

  CONSTRAINT cashier_shifts_status_check
    CHECK (status IN ('open', 'closed')),
  CONSTRAINT cashier_shifts_close_consistent
    CHECK (
      (status = 'open'
        AND closed_at IS NULL
        AND closed_by_staff_id IS NULL
        AND closing_counted_cents IS NULL
        AND closing_expected_cents IS NULL
        AND closing_variance_cents IS NULL)
      OR
      (status = 'closed'
        AND closed_at IS NOT NULL
        AND closed_by_staff_id IS NOT NULL
        AND closing_counted_cents IS NOT NULL
        AND closing_expected_cents IS NOT NULL
        AND closing_variance_cents IS NOT NULL)
    ),
  CONSTRAINT cashier_shifts_float_nonneg
    CHECK (opening_float_cents >= 0)
);

-- "One open shift per staff" — partial unique guarantees a cashier
-- can't accidentally open two drawers at once.
CREATE UNIQUE INDEX IF NOT EXISTS cashier_shifts_one_open_per_staff
  ON cashier_shifts (opened_by_staff_id)
  WHERE status = 'open';

-- Reporting indexes — common reads are "shifts at branch X in date
-- range" and "all shifts for staff Y".
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_branch_opened
  ON cashier_shifts (branch_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_staff_opened
  ON cashier_shifts (opened_by_staff_id, opened_at DESC);

-- Tag every order with its shift, when one is open. Nullable so
-- legacy / shift-less orders still validate.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shift_id BIGINT REFERENCES cashier_shifts(id);

CREATE INDEX IF NOT EXISTS idx_orders_shift_id
  ON orders (shift_id)
  WHERE shift_id IS NOT NULL;

COMMIT;
