-- 2026-07-05_01: staff-initiated loyalty free-wash claims (POS / admin).
--
-- Staff can now claim a plate's free wash directly at the lane. Unlike the
-- customer self-redeem, the plate may belong to a walk-in car with no
-- registered user account, so loyalty_redemptions.customer_user_id must be
-- nullable. Idempotent: DROP NOT NULL is a no-op if already dropped.
ALTER TABLE loyalty_redemptions ALTER COLUMN customer_user_id DROP NOT NULL;
