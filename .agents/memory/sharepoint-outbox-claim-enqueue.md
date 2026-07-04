---
name: SharePoint outbox — enqueue prepaid at claim
description: Why prepaid-QR sales report to Power BI at lane-claim time, not payment, and how the trigger enforces it
---

# SharePoint outbox: prepaid-QR sales report at CLAIM, not payment

The `sharepoint_outbox` trigger (`sharepoint_outbox_enqueue`) enqueues Excel/Power BI
rows. For prepaid-QR orders — `qr_provider IN ('membership','pocket_pay','loyalty')` —
it enqueues the `'sale'` row **at claim time** (when `claimed_at` goes NULL → set at a
lane scan), NOT when the order becomes paid/queued. In-person POS orders (qr_provider
NULL/other) still enqueue the instant they are paid/queued.

**Why:** these orders are created/paid *before* the car reaches a lane, so `branch_id`
is still NULL at payment. Enqueuing then froze Excel column E (Store Name) as "-", and
the already-sent row was never refreshed once the branch became known at scan. Reporting
at claim captures the scanning branch and matches the in-app claim-day revenue bucketing
(bizDay / claimed_at). See prepaid-qr-day-bucketing.md and claim-date-revenue.md.

**How to apply / invariants:**
- The trigger MUST fire on `UPDATE OF status, claimed_at` (claimed_at was added so the
  claim event is caught — status also flips paid→queued at claim so either catches it).
- Prepaid sale enqueue is guarded by `NOT EXISTS (sale row)` = idempotent and avoids a
  duplicate for orders already sent under the old payment-time rule.
- Prepaid refund only mirrors when a sale row already exists (an unclaimed prepaid order
  never reported a sale, so it must not report a refund).
- `buildExcelRow` uses `claimed_at` as the receipt date (cols C/D) for prepaid sales;
  `hydrateJoinedRow` must select `qr_provider` + `claimed_at` for this to work.
- Backfill of old "-" rows: `backfillPrepaidBranchRows()` reads the live Excel row,
  verifies identity (B=order_id, H='No', J=cx_number), and patches ONLY E (Store Name)
  and G (Employee Name = "Kadai <BranchShort>") — never touches dates/amounts. Graph
  API 503/504s are transient; the backfill is idempotent so just re-run.
- An order never claimed at a lane has no branch and stays "-" (correctly excluded from
  branch attribution under this model). Rows written for such orders under the OLD
  payment-time rule are leftovers and can be removed.
- Deleting an Excel row (`deleteExcelRow(index)`) shifts every lower row's index up by
  one, making stored `excel_row_id` values above it stale. Safe today because the worker
  is append-only and only one-off backfills read excel_row_id (and they identity-verify
  B/H/J first). Always identity-check before any index-based delete/update; after a
  delete, null the affected outbox row's excel_row_id (keep status='sent' so it can't
  resend). For frequent deletes, prefer locating by identity columns over stored index.
