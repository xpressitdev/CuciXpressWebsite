-- 2026-08-14_01_backfill_legacy_customers.sql
--
-- ~395 legacy login accounts (imported from the old LiveQue site) have cars
-- linked via cars.user_id but NO row in the customers table, so
-- cars.customer_id is NULL (~444 cars). The admin Customers (CRM) tab keys
-- off the customers table / customer_id, so these people show as
-- "NO ACCOUNT" even though they are registered and their plates are linked.
--
-- Step 1: for each user that owns claimed cars but has no customers row,
--         insert one (phone from users.phone_number, name from
--         first_name+last_name). ON CONFLICT (phone) links an existing
--         walk-in customers row to the user instead — but only when that
--         row isn't already linked to a DIFFERENT user (never steal).
-- Step 2: point that user's NULL-customer cars at their customers row.
--
-- Idempotent: re-running inserts/updates nothing new.

BEGIN;

-- Step 1 -----------------------------------------------------------------
INSERT INTO customers (phone, name, user_id)
SELECT DISTINCT ON (u.phone_number)
       u.phone_number,
       COALESCE(
         NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
         'Customer ' || RIGHT(u.phone_number, 4)
       ),
       u.id
  FROM users u
 WHERE u.phone_number IS NOT NULL
   AND TRIM(u.phone_number) <> ''
   AND EXISTS (SELECT 1 FROM cars c WHERE c.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM customers cu WHERE cu.user_id = u.id)
 ORDER BY u.phone_number, u.id
ON CONFLICT (phone) DO UPDATE
   SET user_id = EXCLUDED.user_id
 WHERE customers.user_id IS NULL;

-- Step 2 -----------------------------------------------------------------
UPDATE cars c
   SET customer_id = cu.min_id
  FROM (
        SELECT user_id, MIN(id) AS min_id
          FROM customers
         WHERE user_id IS NOT NULL
         GROUP BY user_id
       ) cu
 WHERE cu.user_id = c.user_id
   AND c.customer_id IS NULL;

COMMIT;
