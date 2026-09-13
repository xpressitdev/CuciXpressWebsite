-- 2026-09-06_05_pnl_sync_fencing_and_review_allocations.sql
-- Fence distributed Connecteam sync leases and permit an unmapped category to
-- remain allocated to its known branch for review.

ALTER TABLE connecteam_expense_sync_state
  ADD COLUMN IF NOT EXISTS lease_token text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS connecteam_expense_sync_state_lease_idx
  ON connecteam_expense_sync_state(lease_expires_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pnl_expense_allocations_check'
      AND conrelid = 'pnl_expense_allocations'::regclass
  ) THEN
    ALTER TABLE pnl_expense_allocations
      DROP CONSTRAINT pnl_expense_allocations_check;
  END IF;
END $$;

ALTER TABLE pnl_expense_allocations
  ADD CONSTRAINT pnl_expense_allocations_check
  CHECK (
    (allocation_status = 'allocated' AND branch_id IS NOT NULL AND pnl_category IS NOT NULL)
    OR (allocation_status = 'unmapped_category' AND branch_id IS NOT NULL AND pnl_category IS NULL)
    OR (allocation_status NOT IN ('allocated', 'unmapped_category') AND branch_id IS NULL)
  );