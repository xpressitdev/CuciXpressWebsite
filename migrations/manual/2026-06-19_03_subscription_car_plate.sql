-- 2026-06-19_03_subscription_car_plate.sql
-- Bind a one-time subscription purchase to a SPECIFIC car plate (or plates).
-- The B$39 Unlimited wash is per-car: a customer can own several cars, so the
-- membership it funds must point at one vehicle. The B$99 Family plan covers up
-- to 3 cars (one membership per car).
--
-- This column holds the plate(s) entered at checkout-start (comma-joined,
-- normalised UPPERCASE). The Pocket Pay callback reads it to resolve/create the
-- car rows and set memberships.vehicle_id. Without it the finalizer created
-- memberships with vehicle_id = NULL, which the lane redemption flow rejects
-- (`membership_no_vehicle`).
-- Idempotent: safe to re-run on dev, staging, and prod.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS car_plate text;
