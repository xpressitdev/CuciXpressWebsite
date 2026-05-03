-- ============================================================
-- Phase 1 follow-up: dedup duplicate license plates and add a
-- UNIQUE constraint on the normalised plate.
--
-- Owner-approved policy (2026-05-04, "Option 1"):
--   plate is a unique identifier going forward; among existing
--   duplicates, keep the most recent owner. Losers' rows are deleted;
--   any orders.vehicle_id pointing at a loser is repointed to the
--   winner so order history is preserved.
--
-- Winner-selection rule per duplicate group:
--   1. Real customer beats Cuci Xpress shop accounts
--      (`cucixpress.user.bn+*@gmail.com` are internal walk-in proxies
--      created before the new `customers` table existed in 2026-05-04_01).
--   2. Otherwise, highest cars.id wins (most recent registration).
--
-- Idempotent: re-running on a clean DB produces an empty plan, the
-- UPDATE/DELETE are no-ops, and the unique index uses IF NOT EXISTS.
-- ============================================================

BEGIN;

-- 1. Build the plan in a temp table (winners + losers per group).
CREATE TEMP TABLE _dedup_plan ON COMMIT DROP AS
WITH groups AS (
  SELECT c.id,
         UPPER(REGEXP_REPLACE(c.license_plate, '\s+', '', 'g')) AS plate_norm,
         u.email AS user_email
    FROM cars c
    LEFT JOIN users u ON u.id = c.user_id
),
dup_keys AS (
  SELECT plate_norm
    FROM groups
   GROUP BY plate_norm
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT g.id, g.plate_norm,
         ROW_NUMBER() OVER (
           PARTITION BY g.plate_norm
           ORDER BY
             -- Shop accounts lose to real customers.
             (CASE WHEN g.user_email LIKE 'cucixpress.user.bn+%@gmail.com'
                   THEN 1 ELSE 0 END) ASC,
             -- Most-recently registered wins among same-class rows.
             g.id DESC
         ) AS rn
    FROM groups g
   WHERE g.plate_norm IN (SELECT plate_norm FROM dup_keys)
)
SELECT id,
       plate_norm,
       rn,
       (CASE WHEN rn = 1 THEN 'winner' ELSE 'loser' END) AS role
  FROM ranked;

-- 2. Repoint orders.vehicle_id from losers to the surviving winner.
UPDATE orders o
   SET vehicle_id = w.id
  FROM _dedup_plan l
  JOIN _dedup_plan w
    ON w.plate_norm = l.plate_norm
   AND w.role = 'winner'
 WHERE l.role = 'loser'
   AND o.vehicle_id = l.id;

-- 3. Delete the loser car rows.
DELETE FROM cars
 WHERE id IN (SELECT id FROM _dedup_plan WHERE role = 'loser');

-- 4. Replace the non-unique functional index from 2026-05-04_01 with
--    a UNIQUE one. Going forward, `ON CONFLICT (UPPER(REGEXP_REPLACE(...)))`
--    cannot be used directly on a functional unique index in older
--    Postgres, so the upsert path uses the existing
--    "find-by-normalised-plate then UPDATE/INSERT" logic — but the
--    constraint guarantees no new dupes can ever be inserted.
DROP INDEX IF EXISTS cars_plate_normalized_idx;
CREATE UNIQUE INDEX IF NOT EXISTS cars_plate_normalized_unique
  ON cars (UPPER(REGEXP_REPLACE(license_plate, '\s+', '', 'g')));

COMMIT;
