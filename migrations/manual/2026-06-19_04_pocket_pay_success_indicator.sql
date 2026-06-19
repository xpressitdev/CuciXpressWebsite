-- Persist the Pocket Pay per-order `success_indicator` so the payment callback
-- can authenticate itself. Pocket Pay returns this token at payment-create time
-- and echoes it back in the callback body (field: successIndicator). Matching the
-- stored value against the callback is how we verify the callback is genuine —
-- the previous MD5 "hash" check was a stub that never matched Pocket Pay's real
-- callback contract, so every callback 400'd and no payment ever finalized.
-- Idempotent. Apply to BOTH $DATABASE_URL and $STAGING_DATABASE_URL.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS pocket_pay_success_indicator text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pocket_pay_success_indicator text;

-- LEGACY RECONCILIATION RUNBOOK
-- Rows that existed BEFORE this column was added (or that were created by the
-- old prod build that never wrote it) have pocket_pay_success_indicator IS NULL.
-- The new callback cannot authenticate them, so a callback for such a row 400s
-- and it stays stuck. Do NOT add a NULL-indicator fallback in the callback — that
-- reopens the forged-callback hole. Reconcile manually instead:
--   * Subscriptions: confirm the payment out-of-band, then finalize the stuck
--     'incomplete' row by invoking activatePocketPaySubscription(<gateway order id>)
--     (idempotent — claims status='incomplete' atomically).
--   * Orders: confirm payment out-of-band before flipping any 'pending_payment'
--     row to paid; unpaid abandoned carts should be left/voided, never auto-paid.
-- As of this migration: 0 'incomplete' subscriptions remain; pending_payment
-- single-wash orders with NULL indicator are pre-existing abandoned attempts.
