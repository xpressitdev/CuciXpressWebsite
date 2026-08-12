-- Performance indexes (12 Aug 2026 "upstream request timeout" episode).
-- Both queries below were seq-scanning ~138k orders on every request:
--   1. /api/customer/orders matches by normalized plate — needs an
--      expression index matching UPPER(REGEXP_REPLACE(plate, '\s+', '', 'g')).
--   2. computeShiftTotals (POS /api/pos/shifts/current, polled by every
--      terminal) filters by branch + Brunei business day — needs an
--      expression index matching the bizDay() CASE expression exactly.
-- Idempotent; apply to BOTH $DATABASE_URL and $STAGING_DATABASE_URL.

CREATE INDEX IF NOT EXISTS orders_plate_norm_idx
  ON orders (UPPER(REGEXP_REPLACE(plate, '\s+', '', 'g')));

CREATE INDEX IF NOT EXISTS orders_branch_bizday_idx
  ON orders (branch_id, date((CASE
      WHEN qr_provider = 'pocket_pay' THEN claimed_at
      WHEN qr_provider IN ('loyalty','membership') THEN COALESCE(claimed_at, created_at)
      ELSE created_at END) AT TIME ZONE 'Asia/Brunei'));
