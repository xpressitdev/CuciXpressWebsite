-- ============================================================
-- Task 1.5 — Google OAuth schema prerequisites
-- Date: 2026-05-02
-- Apply via: executeSql (multi-statement, no params)
--
-- Changes:
--   1. Add `users.google_id` (text, nullable, unique) — holds Google's
--      `sub` claim from the OIDC id_token. Nullable so legacy
--      password-based users continue to exist; unique so a Google
--      identity maps to exactly one user.
--
--   2. Drop NOT NULL on `users.phone_number` and `users.address`.
--      Why: Google sign-in returns email + name only — no phone or
--      postal address. Forcing those at account-creation time would
--      mean either rejecting all Google sign-ups or stuffing empty
--      strings, both of which are worse than letting them be NULL
--      until the user fills out their profile. All 508 existing
--      users already have non-null values, so the alter is
--      non-destructive.
--
-- Rollback:
--   ALTER TABLE users DROP COLUMN google_id;
--   -- (Re-adding NOT NULL is unsafe if any Google-created users
--   --  exist by then; do NOT auto-rollback the nullability.)
-- ============================================================

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id text;

-- Postgres won't let you add a UNIQUE constraint inline if the
-- column already exists, so do it as a separate idempotent step.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_google_id_unique'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_google_id_unique UNIQUE (google_id);
  END IF;
END$$;

ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE users ALTER COLUMN address      DROP NOT NULL;

COMMIT;
