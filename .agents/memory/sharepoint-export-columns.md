---
name: SharePoint/OneDrive Excel export column changes
description: How to safely add/remove a column in the POS -> OneDrive Excel export, and the Table column-count + dual-drainer rollout landmine.
---

# Changing columns in the OneDrive/Power BI Excel export

The export appends rows to an **Excel Table** (ListObject) via Graph
`.../workbook/tables/{name}/rows/add`. The values array length MUST equal the
table's column count exactly, or the append 400s. So adding/removing an exported
column is a **coordinated data + code change**, not a pure code change.

**Rule — to add a column (e.g. "Transaction Fee"):**
- Append it as the LAST column in `buildExcelRow` (never insert in the middle:
  the refund-sign backfill reads live cells by fixed index, e.g. M=12, R=17;
  inserting mid-row shifts those and corrupts identity checks).
- The live Excel Table(s) must get a matching header as the LAST column BEFORE
  the 26-col code runs against them, else appends fail (they retry w/ backoff, so
  a short mismatch window is safe — a row only goes terminal after 8 attempts ≈
  4h).

**Dual-drainer landmine (this repl):** dev and prod share `DATABASE_URL` and
both run the outbox worker, but point at DIFFERENT files (dev → a DUMMY test
workbook, prod → the real master). They compete for the same `sharepoint_outbox`
rows. So a column change must be applied to EVERY file any active drainer targets
(dummy + master), or the dev drainer will fail 26-col appends on shared
production rows and burn their retry attempts. Safest: add the column to both
files, or leave the dev workspace closed (its workflow — and worker — stop when
idle) during the prod cutover.

**Transaction Fee column semantics:** per-order MDR = round(total_cents * bps /
10000) in cents, bps from `payment_fee_rates` keyed by
`payment_method|qr_provider` (missing = 0, so cash/bank = 0). Refund rows emit 0
(provider keeps its cut; admin report bases MDR on gross). Because Order Total is
negative on refund rows, `SUM(Order Total) - SUM(Transaction Fee)` in Power BI =
Net After Fees. Caveat: the export rounds PER ROW while the admin tile rounds PER
(method,provider) GROUP, so the BI sum can differ from the dashboard MDR figure
by a few cents — inherent to any per-order fee column, acceptable.
