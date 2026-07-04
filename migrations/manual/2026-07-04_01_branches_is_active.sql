-- 2026-07-04_01: mark permanently-closed / archived branches distinct from
-- temporarily-closed ones (status='closed' is used by cashiers for a normal
-- day-close and must still show on the public live queue). is_active=false is
-- reserved for defunct branches (e.g. the closed Pandan branch we import legacy
-- sales for) so the public /api/queue/snapshot can hide them while reports keep
-- counting their historical orders.
--
-- Additive + idempotent. Apply to BOTH $DATABASE_URL and $STAGING_DATABASE_URL.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
