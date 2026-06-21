-- Add the 'investor' role to the staff.role CHECK constraint.
--
-- Investor is a read-only reporting role (dashboard, order report, payment
-- methods, best selling, trends) that is global across all branches. The
-- original constraint was declared inline on the staff table with an
-- auto-generated name, so we look it up by definition, drop it, and re-add a
-- named constraint that includes 'investor'. Idempotent: re-running finds the
-- (now named) constraint, drops it, and re-creates it.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname
    INTO cname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'staff'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%role%'
     AND pg_get_constraintdef(con.oid) ILIKE '%cashier%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE staff DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE staff
  ADD CONSTRAINT staff_role_check
  CHECK (role IN ('owner', 'manager', 'lane', 'cashier', 'investor'));
