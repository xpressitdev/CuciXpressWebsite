-- 2026-09-06_03_seed_existing_branch_depreciation.sql
-- The original P&L migration was applied to an environment where branch names
-- have the `Cuci Xpress ` prefix. Seed the confirmed Jan-Jun workbook value
-- for those canonical five branches without inventing Jul-Dec values.

INSERT INTO pnl_depreciation_settings (year, month, branch_id, cents)
SELECT 2026, month_number, b.id, 14167
FROM generate_series(1, 6) AS month_number
CROSS JOIN branches AS b
WHERE lower(trim(b.name)) IN (
  'tungku', 'salar', 'bengkurong', 'tutong', 'lambak',
  'cuci xpress tungku', 'cuci xpress salar', 'cuci xpress bengkurong',
  'cuci xpress tutong', 'cuci xpress lambak'
)
ON CONFLICT (year, month, branch_id) DO NOTHING;