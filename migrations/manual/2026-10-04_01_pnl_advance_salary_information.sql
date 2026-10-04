-- Preserve branch-level advance salary audit entries without counting expenses.
BEGIN;
ALTER TABLE pnl_expense_allocations
  DROP CONSTRAINT IF EXISTS pnl_expense_allocations_allocation_status_check;
ALTER TABLE pnl_expense_allocations
  ADD CONSTRAINT pnl_expense_allocations_allocation_status_check CHECK (
    allocation_status IN ('allocated', 'unmapped_category', 'invalid_amount',
      'invalid_date', 'invalid_branch', 'excluded_status',
      'excluded_mdr_duplicate', 'excluded_advance_salary')
  );
ALTER TABLE pnl_expense_allocations
  DROP CONSTRAINT IF EXISTS pnl_expense_allocations_check;
ALTER TABLE pnl_expense_allocations
  ADD CONSTRAINT pnl_expense_allocations_check CHECK (
    (allocation_status = 'allocated' AND branch_id IS NOT NULL AND pnl_category IS NOT NULL)
    OR (allocation_status IN ('unmapped_category', 'excluded_advance_salary')
        AND branch_id IS NOT NULL AND pnl_category IS NULL)
    OR (allocation_status NOT IN ('allocated', 'unmapped_category', 'excluded_advance_salary')
        AND branch_id IS NULL)
  );
COMMIT;