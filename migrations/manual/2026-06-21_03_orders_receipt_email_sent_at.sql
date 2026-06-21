-- 2026-06-21_03 — Track when the web-checkout receipt email was sent.
--
-- The receipt (+ QR) is emailed from /api/payment-callback the moment payment
-- is confirmed. To make delivery reliable WITHOUT double-sending, both the
-- callback and the (secret-gated) /api/payment-success-order endpoint claim the
-- send atomically: UPDATE ... SET receipt_email_sent_at = now() WHERE ... AND
-- receipt_email_sent_at IS NULL RETURNING ... . Whoever wins the row sends; on
-- a transient send failure the column is reset to NULL so a later trigger can
-- retry. NULL = receipt not yet sent.
--
-- Idempotent. Apply to BOTH $DATABASE_URL and $STAGING_DATABASE_URL.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_email_sent_at timestamptz;
