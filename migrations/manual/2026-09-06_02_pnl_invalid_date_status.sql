-- 2026-09-06_02_pnl_invalid_date_status.sql
-- Distinguish a missing/invalid expense date from an invalid amount in the
-- P&L audit queue. Safe constraint replacement; no accounting rows are lost.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pnl_expense_allocations_allocation_status_check'
      AND conrelid = 'pnl_expense_allocations'::regclass
  ) THEN
    ALTER TABLE pnl_expense_allocations
      DROP CONSTRAINT pnl_expense_allocations_allocation_status_check;
  END IF;
END $$;

ALTER TABLE pnl_expense_allocations
  ADD CONSTRAINT pnl_expense_allocations_allocation_status_check
  CHECK (allocation_status IN (
    'allocated', 'unmapped_category', 'invalid_amount', 'invalid_date',
    'invalid_branch', 'excluded_status'
  ));