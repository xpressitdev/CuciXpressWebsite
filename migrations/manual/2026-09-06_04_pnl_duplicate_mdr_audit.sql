-- 2026-09-06_04_pnl_duplicate_mdr_audit.sql
-- A manually submitted Connecteam MDR line is retained for audit but excluded
-- from P&L totals: payment-fee-rate accounting is the single MDR source.

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
    'invalid_branch', 'excluded_status', 'excluded_mdr_duplicate'
  ));