-- 2026-06-21_02 — Persist the buyer's email on web-checkout orders.
--
-- Website Pocket Pay checkout now REQUIRES an email and we email the receipt
-- (+ QR) the moment /api/payment-callback confirms the payment. The callback
-- only has the Pocket Pay order id, so we must store the email on the order at
-- create time to retrieve it later. Nullable: POS / walk-in orders don't set it.
--
-- Idempotent. Apply to BOTH $DATABASE_URL and $STAGING_DATABASE_URL.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email text;
