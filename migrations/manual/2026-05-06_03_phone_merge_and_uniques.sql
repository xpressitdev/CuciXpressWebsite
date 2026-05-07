-- 2026-05-06_03_phone_merge_and_uniques.sql
--
-- Follow-up to 2026-05-06_02_phone_canonical.sql.
--
-- (a) Backfills 7-digit local-only phone numbers (e.g. "7168881") to the
--     country-code-prefixed canonical form ("6737168881"). The previous
--     migration only normalised rows containing non-digit characters, so
--     bare 7-digit numbers were skipped.
-- (b) Merges user_id=3 (Pengiran Abdul Hakem Shahbirin / hakemshahbirin@gmail.com)
--     into user_id=1 (Pg Hakem / pengiranabdulhakem@gmail.com). Both shared
--     phone 6738669378 from the original 2026-05-02 cucixpress / liveque
--     consolidation. user_id=3 had 2 pending_payment orders + 1 stale
--     auth_session + 0 customers/cars/memberships.
-- (c) Adds a partial UNIQUE index on customers.phone (one already exists as
--     customers_phone_unique — verified, no-op for that table).
--
-- NOT done in this migration: 14 other duplicate phone groups in `users`
-- (e.g. 6738387000 × 4 = staff branch test accounts; 6737113629 × 5 = same
-- person with multiple email aliases). These need owner-by-owner judgment
-- before a UNIQUE constraint can be added on users.phone_number. See
-- session notes for the full list.
--
-- Apply manually:
--   psql "$DATABASE_URL" -f migrations/manual/2026-05-06_03_phone_merge_and_uniques.sql

BEGIN;

-- (a) 7-digit local → country-code prefixed.
UPDATE users     SET phone_number = '673' || phone_number WHERE phone_number ~ '^[0-9]{7}$';
UPDATE customers SET phone        = '673' || phone        WHERE phone        ~ '^[0-9]{7}$';

-- (b) Merge user 3 → user 1.
UPDATE orders SET customer_id = 1 WHERE customer_id = 3;
UPDATE cars   SET user_id     = 1 WHERE user_id     = 3;
DELETE FROM auth_sessions WHERE user_id = '3';
DELETE FROM users         WHERE id      = 3;

COMMIT;

-- (c) Customers phone uniqueness — there is already a customers_phone_unique
--     full-table UNIQUE INDEX from the earlier consolidation. We don't add
--     a duplicate. (No DDL emitted.)

-- NOTE: users.phone_number UNIQUE index is INTENTIONALLY NOT added here.
-- Pre-existing duplicates from the 2026-05-02 consolidation must be
-- resolved one-by-one first. When ready:
--   CREATE UNIQUE INDEX users_phone_number_uniq
--     ON users (phone_number)
--     WHERE phone_number IS NOT NULL AND phone_number <> '';
