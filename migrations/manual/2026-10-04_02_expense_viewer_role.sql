BEGIN;
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('owner', 'manager', 'cashier', 'lane', 'investor', 'expense_viewer'));
COMMIT;