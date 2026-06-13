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
or the drain/claim logic. If asked to backfill already-sent positive refund
rows, that's a separate in-place Excel edit (Graph update by stored
`excel_row_id`) — the code fix is forward-only.
