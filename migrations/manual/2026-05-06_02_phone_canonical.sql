-- 2026-05-06_02_phone_canonical.sql
--
-- Bug fix: OTP login normaliser only stripped whitespace, so "+6738669378"
-- and "6738669378" were treated as two different identities. Logging in
-- with the no-"+" form created a brand-new account.
--
-- This migration:
--   1) Canonicalises every users.phone_number and customers.phone to the
--      bare-digits form (e.g. "6738669378"). The dominant form already in
--      the DB is bare-digits (375 / 512 user rows), so we collapse the "+"
--      variants into that form.
--   2) Deletes the empty bug-created duplicate (user 544 / customer 4) —
--      verified to have 0 orders, 0 cars, 0 memberships before running.
--   3) Does NOT touch user_id=3 (Pengiran Abdul Hakem Shahbirin) — that is
--      a pre-existing duplicate from the original DB import (different
--      email), unrelated to this bug. Owner will resolve manually.
--
-- Apply manually (we don't use drizzle migrations):
--   psql "$DATABASE_URL" -f migrations/manual/2026-05-06_02_phone_canonical.sql

BEGIN;

-- 1) Delete the bug-created duplicate first so the canonicalisation in
--    step (2) doesn't trip on a future unique index. customer_id=4 has no
--    orders/cars/memberships; user_id=544 has only stale auth_sessions.
DELETE FROM auth_sessions WHERE user_id = '544';
DELETE FROM customers     WHERE id      = 4;
DELETE FROM users         WHERE id      = 544;

-- 2) Canonicalise users.phone_number — strip "+", spaces, parens, dashes.
--    7-digit local numbers get a 673 prefix.
UPDATE users
   SET phone_number = CASE
       WHEN length(regexp_replace(phone_number, '\D', '', 'g')) = 7
         THEN '673' || regexp_replace(phone_number, '\D', '', 'g')
       ELSE regexp_replace(phone_number, '\D', '', 'g')
     END
 WHERE phone_number IS NOT NULL
   AND phone_number <> regexp_replace(phone_number, '\D', '', 'g');

-- 3) Same for customers.phone.
UPDATE customers
   SET phone = CASE
       WHEN length(regexp_replace(phone, '\D', '', 'g')) = 7
         THEN '673' || regexp_replace(phone, '\D', '', 'g')
       ELSE regexp_replace(phone, '\D', '', 'g')
     END
 WHERE phone IS NOT NULL
   AND phone <> regexp_replace(phone, '\D', '', 'g');

COMMIT;
