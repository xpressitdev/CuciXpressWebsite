-- ============================================================
-- Phase 5c+ : Branch-scoped add-ons.
--
-- Mirrors 2026-05-04_08_package_branches.sql for the
-- `addons_catalog` table. Owner now wants the same
-- branch-restriction control over add-ons (e.g. Engine Bay
-- Wash isn't offered at every branch).
--
-- Same semantics as packages:
--   * Many-to-many; an add-on lives at any subset of branches.
--   * **Empty assignment = available at all branches.**
--     Existing add-ons require no backfill.
--   * The `addons_catalog` row is never moved/deleted.
--
-- POS effect:
--   `/api/pos/catalog?branch_id=X` returns an add-on iff
--     (no rows in addon_branches for that addon_id)
--      OR
--     (a row exists matching branch_id = X).
--
-- Admin effect:
--   List endpoint adds `branch_ids: number[]` to each row
--   (empty array = all). POST/PATCH accept `branch_ids` and
--   rewrite the join.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS addon_branches (
  addon_id   text    NOT NULL REFERENCES addons_catalog(id) ON DELETE CASCADE,
  branch_id  integer NOT NULL REFERENCES branches(id)        ON DELETE CASCADE,
  PRIMARY KEY (addon_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_addon_branches_branch
  ON addon_branches (branch_id);

COMMIT;

-- Verification:
--   SELECT count(*) FROM addon_branches;  -- expected: 0 (default = all)
