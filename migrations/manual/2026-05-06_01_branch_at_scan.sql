-- 2026-05-06_01_branch_at_scan.sql
--
-- Branch-at-scan model.
--
-- Customers buy a wash from anywhere (home, work, on the road) and the
-- branch they actually use is decided at scan-in time at the lane.
-- Until they scan, the order has no branch — it doesn't appear on any
-- branch's POS or live queue. The verify-qr endpoint stamps the
-- scanning cashier's branch_id onto the order on first scan.
--
-- This drops the NOT NULL constraint on:
--   * orders.branch_id           — pending_payment / paid orders may be
--                                   branchless until scanned at the lane.
--   * loyalty_redemptions.branch_id — same, the voucher's branch is
--                                   decided when it's scanned, not when
--                                   the customer redeems on the dashboard.
--
-- No data backfill needed; existing rows already have a branch_id.

ALTER TABLE orders              ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE loyalty_redemptions ALTER COLUMN branch_id DROP NOT NULL;
