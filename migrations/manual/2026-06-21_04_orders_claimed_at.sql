-- 2026-06-21_04_orders_claimed_at.sql
-- Web-prepaid revenue realization on the CLAIM day.
--
-- Web checkout orders pay via Pocket Pay on cucixpress.com
-- (qr_provider = 'pocket_pay') and are PREPAID: the customer may pay one day and
-- scan the wash QR at the lane on another. We now realize their revenue on the
-- day the QR is scanned (claimed), not the day it was paid. claimed_at holds that
-- scan timestamp; reports/POS bucket web orders by it instead of created_at.
-- All other (in-store) orders keep using created_at, so this column stays NULL
-- for them and is irrelevant to their bucketing.
--
-- Idempotent. Apply to BOTH $DATABASE_URL and $STAGING_DATABASE_URL
-- (db:push / drizzle-kit are blocked in this project).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Backfill ONLY already-claimed web orders so historical reports stay identical.
-- A web Pocket Pay order receives a ticket_code only when it is scanned at the
-- lane (verify-qr), so `ticket_code IS NOT NULL` precisely identifies the ones
-- that were already claimed. We set claimed_at = created_at for those, which
-- reproduces the previous (paid-day) bucketing exactly for past data.
-- Paid-but-not-yet-claimed web orders are left NULL on purpose: they will be
-- stamped with the real scan time when they are claimed going forward.
UPDATE orders
   SET claimed_at = created_at
 WHERE qr_provider = 'pocket_pay'
   AND claimed_at IS NULL
   AND ticket_code IS NOT NULL;
