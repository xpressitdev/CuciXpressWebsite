---
name: SharePoint refund row sign
description: Which money columns flip negative on refund rows in the SharePoint/Power BI Excel master.
---

# Refund rows = ONLY Order Total negative in the SharePoint Excel master

**Rule:** When the outbox emits a `op='refund'` row, ONLY the `R Order Total`
column is NEGATIVE. Every other money column stays POSITIVE (natural sign):
the breakdown columns (M Subtotal, N Discount, O Promo, P Service charge,
Q Tax) AND the settlement columns (S Paid, T Change). Zero stays zero
(no `-0`). The `H Is Refund=Yes` / `I Original Receipt No` flags remain.

**Why:** The owner's previous POS export kept the breakdown positive and used
Order Total as the single directional figure. A `SUM(Order Total)` in Power BI
nets refunds out (a refunded B$8 sale → +8 then −8 = 0), while `SUM(Subtotal)`
stays gross. An earlier version negated ALL money columns (M..T) — the owner
explicitly rejected that: Subtotal must stay positive, only Order Total negative.

**How to apply:** Negation lives in `buildExcelRow()` only — `orderTotalMoney()`
negates column R off `op==='refund'`; the plain `money()` helper is natural-sign
for all other columns. Never negate in the importer (it SKIPS refund rows) or the
drain/claim logic. The code fix is forward-only.

**Backfilling already-sent rows:** `backfillSentRefundRows()` (run via
`scripts/backfill_refund_signs.ts`, `DRY=1` to preview) PATCHes each sent refund
row in place to the current convention. The stored `excel_row_id` IS the table
data-body index, usable directly in Graph `rows/itemAt(index=N)` GET/PATCH — valid
only because the master is append-only (manual re-sort/delete would drift it, so
the backfill GETs the live row and verifies B=order_id / H=Yes / J=cx before
overwriting, and skips on mismatch). Idempotent: skips rows already in convention
(Subtotal ≥ 0 AND Order Total ≤ 0). Each Graph PATCH is slow (~15s) and the script
can exceed a 120s foreground/bash limit — run it via a temp console workflow and
poll `getWorkflowStatus` until finished (detached bash procs get killed).
