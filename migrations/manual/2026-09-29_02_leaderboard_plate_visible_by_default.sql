-- One-time explicit reset of all existing preferences to visible; after this
-- migration, a customer's later opt-out must survive any rerun.
BEGIN;

ALTER TABLE users
  ALTER COLUMN show_full_plate_on_leaderboard SET DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS app_data_migrations (
  migration_key TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

WITH first_application AS (
  INSERT INTO app_data_migrations (migration_key)
  VALUES ('2026-09-29_02_leaderboard_plate_visible_by_default')
  ON CONFLICT (migration_key) DO NOTHING
  RETURNING migration_key
)
UPDATE users
   SET show_full_plate_on_leaderboard = TRUE
 WHERE show_full_plate_on_leaderboard IS DISTINCT FROM TRUE
   AND EXISTS (SELECT 1 FROM first_application);

COMMIT;