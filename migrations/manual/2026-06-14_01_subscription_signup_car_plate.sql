-- 2026-06-14_01 — Capture car plate on subscription signups
--
-- The /subscriptions "founding member" signup now collects the customer's
-- car plate so staff can match the membership to a vehicle when they follow
-- up. Nullable + idempotent: legacy waitlist rows (email only) are unaffected.
--
-- Apply to BOTH $DATABASE_URL and $STAGING_DATABASE_URL (db:push is blocked).

ALTER TABLE subscription_signups
  ADD COLUMN IF NOT EXISTS car_plate text;
