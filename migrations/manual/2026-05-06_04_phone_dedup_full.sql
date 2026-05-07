-- 2026-05-06_04_phone_dedup_full.sql
--
-- Owner-approved cleanup of the remaining 14 duplicate-phone groups in
-- `users` (left over from the 2026-05-02 cucixpress / liveque DB
-- consolidation). Adds the final UNIQUE INDEX on users.phone_number.
--
-- Plan, reviewed with the owner on 2026-05-06:
--   Type A — branch fixtures sharing the business line 6738387000:
--            NULL the phone (4 staff accounts: Tungku, Salar, Bengkurong,
--            Tutong). Keep the rows; they don't need OTP login.
--   Type B — same person with multiple email aliases (11 groups):
--            keep the oldest user_id, repoint cars/orders, delete the rest.
--   Type C — same person across 3 groups (per owner): merge to oldest.
--
-- All to-delete users had 0 orders, 0 memberships, 0 sessions, 0 rows in
-- user_achievements / service_history / subscription_signups /
-- loyalty_redemptions before this ran. Only cars needed repointing.
--
-- Apply manually:
--   psql "$DATABASE_URL" -f migrations/manual/2026-05-06_04_phone_dedup_full.sql

BEGIN;

-- ── Repoint cars from each duplicate user to its keeper ──────────────
-- Type B
UPDATE cars SET user_id =  33 WHERE user_id = 385;
UPDATE cars SET user_id = 102 WHERE user_id = 103;
UPDATE cars SET user_id =  78 WHERE user_id =  79;
UPDATE cars SET user_id = 134 WHERE user_id = 137;
UPDATE cars SET user_id = 291 WHERE user_id = 293;
UPDATE cars SET user_id = 250 WHERE user_id = 251;
UPDATE cars SET user_id = 212 WHERE user_id = 213;
UPDATE cars SET user_id = 252 WHERE user_id = 265;
UPDATE cars SET user_id = 179 WHERE user_id = 181;
UPDATE cars SET user_id =  56 WHERE user_id =  59;
UPDATE cars SET user_id =  45 WHERE user_id =  46;
-- Type C — owner confirmed these are the same person across multiple emails
UPDATE cars SET user_id =   4 WHERE user_id IN (5, 7, 9, 10);
UPDATE cars SET user_id = 254 WHERE user_id IN (266, 281);
UPDATE cars SET user_id = 249 WHERE user_id = 255;

-- Defensive — repoint any orders too (counted as 0 at run time but kept
-- for replay safety against future imports).
UPDATE orders SET customer_id =  33 WHERE customer_id = 385;
UPDATE orders SET customer_id = 102 WHERE customer_id = 103;
UPDATE orders SET customer_id =  78 WHERE customer_id =  79;
UPDATE orders SET customer_id = 134 WHERE customer_id = 137;
UPDATE orders SET customer_id = 291 WHERE customer_id = 293;
UPDATE orders SET customer_id = 250 WHERE customer_id = 251;
UPDATE orders SET customer_id = 212 WHERE customer_id = 213;
UPDATE orders SET customer_id = 252 WHERE customer_id = 265;
UPDATE orders SET customer_id = 179 WHERE customer_id = 181;
UPDATE orders SET customer_id =  56 WHERE customer_id =  59;
UPDATE orders SET customer_id =  45 WHERE customer_id =  46;
UPDATE orders SET customer_id =   4 WHERE customer_id IN (5, 7, 9, 10);
UPDATE orders SET customer_id = 254 WHERE customer_id IN (266, 281);
UPDATE orders SET customer_id = 249 WHERE customer_id = 255;

-- ── Drop the now-empty duplicate users ────────────────────────────────
DELETE FROM auth_sessions WHERE user_id IN
  ('5','7','9','10','46','59','79','103','137','181','213','251','255','265','266','281','293','385');
DELETE FROM users WHERE id IN
  (5, 7, 9, 10, 46, 59, 79, 103, 137, 181, 213, 251, 255, 265, 266, 281, 293, 385);

-- ── Type A: NULL the phone on the 4 branch-fixture staff accounts ────
-- They share the business landline 6738387000. NULL is excluded from the
-- partial unique index below, so this both preserves the accounts and
-- clears the collision.
UPDATE users SET phone_number = NULL WHERE id IN (235, 284, 285, 287);

-- ── Final lock: enforce UNIQUE on users.phone_number ─────────────────
-- Partial index so NULL / empty are allowed (some legacy users have no
-- phone, and the branch fixtures above intentionally store NULL).
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_number_uniq
  ON users (phone_number)
  WHERE phone_number IS NOT NULL AND phone_number <> '';

COMMIT;
