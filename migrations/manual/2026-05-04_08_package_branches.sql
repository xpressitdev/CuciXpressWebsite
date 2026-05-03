-- ============================================================
-- Phase 5c+ : Branch-scoped packages.
--
-- Background. The owner runs 6 branches but not every wash
-- package is offered everywhere — e.g. "Interior Cleaning" is
-- a Tungku-only service. Until now `packages` was global
-- (every active row appeared in every till), which meant
-- cashiers at other branches could ring up services they
-- can't deliver.
--
-- Decision (confirmed with owner 2026-05-04):
--   * Many-to-many. A package can live at any subset of
--     branches; a branch has many packages.
--   * **Empty assignment = available at all branches.**
--     This keeps the existing 7 packages working without a
--     data migration: they stay in the join table empty and
--     remain visible everywhere.
--   * No row in `packages` is ever moved/deleted by this
--     migration — only the new join table is created.
--   * Add-ons are NOT branch-scoped this round (owner said
--     add-ons are universal). Same join-table pattern can
--     be added later if that ever changes.
--
-- POS effect:
--   `/api/pos/catalog?branch_id=X` returns a package iff
--     (no rows in package_branches for that package_id)
--      OR
--     (a row exists matching branch_id = X).
--
-- Admin effect:
--   List endpoint adds `branch_ids: number[]` to each row
--   (empty array = all). POST/PATCH accept `branch_ids` and
--   rewrite the join in a transaction.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS package_branches (
  package_id  text    NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  branch_id   integer NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, branch_id)
);

-- Reverse lookup: "which packages are visible at branch X?"
CREATE INDEX IF NOT EXISTS idx_package_branches_branch
  ON package_branches (branch_id);

COMMIT;

-- Verification (run by hand after applying):
--   SELECT count(*) FROM package_branches;  -- expected: 0 (default = all)
--   \d package_branches
