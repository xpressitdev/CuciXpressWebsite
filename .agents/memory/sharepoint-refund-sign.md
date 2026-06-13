---
name: SharePoint refund row sign
description: Why refund rows in the SharePoint/Power BI Excel master carry negative money amounts.
---

# Refund rows = negative money in the SharePoint Excel master

**Rule:** When the outbox emits a `op='refund'` row, the money columns
(M Subtotal, N Discount, O Promo, P Service charge, Q Tax, R Order Total,
S Paid, T Change) MUST be NEGATIVE. Sales stay positive. Zero stays zero
(no `-0`). The `H Is Refund=Yes` / `I Original Receipt No` flags remain.

**Why:** The master file is one-row-per-event (a sale row, plus a separate
refund row when an order is refunded — KedaiPOS convention). Power BI tallies
by plain SUM of the amount columns, so a positive refund double-counts (a
refunded B$8 sale would total +B$16 instead of B$0). The user's historical
KedaiPOS refund rows are already negative, so app rows must match.

**How to apply:** Negation lives in `buildExcelRow()` only (a `money()` helper
keyed off `op==='refund'`); never negate in the importer (it SKIPS refund rows)
or the drain/claim logic. The code fix is forward-only.

**Backfilling already-sent positive refund rows:** `backfillSentRefundRows()`
(run via `scripts/backfill_refund_signs.ts`, `DRY=1` to preview) PATCHes each
sent refund row in place. The stored `excel_row_id` IS the table data-body
index, usable directly in Graph `rows/itemAt(index=N)` GET/PATCH — valid only
because the master is append-only (manual re-sort/delete would drift it, so the
backfill GETs the live row and verifies B=order_id / H=Yes / J=cx before
overwriting, and skips on mismatch). It is idempotent (skips rows already M<0).
Each Graph PATCH is slow (~15s); a 90s foreground run does ~5 rows, so just
re-run to finish the rest (or use a temp console workflow for big batches).
