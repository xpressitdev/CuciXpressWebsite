-- 2026-06-19_02_subscription_pocketpay.sql
-- One-time Pocket Pay subscription purchases (no auto-renew).
-- A customer pays ONCE via Pocket Pay (B$39 unlimited / B$99 family) and gets a
-- 1-month `unlimited` membership. The subscription row is created 'incomplete'
-- at checkout-start and promoted to 'active' by the Pocket Pay callback.
-- Because there is no stored card, it never auto-renews: it is created with
-- cancel_at_period_end = true and the existing renewal worker retires it at
-- period end (membership lazy-expires).
-- Idempotent: safe to re-run on dev, staging, and prod.

-- Which gateway funded this subscription. NULL = legacy CyberSource rows.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_provider text;

-- The Pocket Pay order_id for this purchase. The payment callback looks the
-- pending ('incomplete') subscription up by this value to finalize it.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pocket_pay_ref text;

CREATE INDEX IF NOT EXISTS subscriptions_pocket_pay_ref_idx
  ON subscriptions(pocket_pay_ref)
  WHERE pocket_pay_ref IS NOT NULL;
