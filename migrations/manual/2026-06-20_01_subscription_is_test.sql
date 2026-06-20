-- 2026-06-20_01_subscription_is_test.sql
-- Owner-only CyberSource recurring-subscription SANDBOX.
--
-- Flags a subscription row as a TEST subscription created from the admin
-- "Subscription Test" tab. Test subscriptions exercise the full CyberSource
-- flow (Unified Checkout capture context -> first charge -> stored card token ->
-- merchant-initiated auto-renewals) against the TEST gateway, WITHOUT touching
-- the live Pocket Pay subscription / membership data:
--   * they carry user_id = NULL and customer_id = NULL,
--   * they create NO maintaining membership (membership_id stays NULL),
-- so they never surface in customer-facing `/api/subscriptions/me`, the
-- membership-based revenue report, POS, or loyalty. The renewal worker still
-- processes them (test gateway = no real money), which is the point.
--
-- Idempotent: safe to re-run on dev, staging, and prod.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- The renewal worker scans by (status, next_billing_at); no new index needed.
