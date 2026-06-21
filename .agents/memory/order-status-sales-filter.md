---
name: Order status sales filter
description: Which order statuses count as a real sale in admin revenue/report queries
---

# What counts as a "sale" in reports

Admin revenue/report SQL historically guarded sales with `status <> 'refunded'`.
That is too permissive: it lets `voided` (failed/cancelled payment) and
`pending_payment` (abandoned web checkout) count as sales and show up in the
Order Report listing.

The rule: a real sale is any status EXCEPT `refunded`, `voided`, `pending_payment`.
- `paid | queued | washing | done` → real sales (count + list).
- `refunded` → stays IN the data source, shown separately and subtracted.
- `voided | pending_payment` → excluded entirely (not listed, not counted).

**How to apply:** there is a `realOrders(prefix)` helper next to `bizDay()` in
`server/routes.ts` that emits `AND <prefix>status NOT IN ('voided','pending_payment')`.
Add it to the data-source WHERE/CTE/JOIN-ON of every admin revenue surface
(dashboard tiles+hourly+feeGroups, order report rows/count/totals/feeGroups+export,
payment-methods, best-selling, trends daily/by-branch/heatmap/totals, POS today,
shift totals). In trends LEFT JOINs it MUST go in the `ON` clause (not WHERE) or
gap-filled days/branches disappear.

**Why:** failed/abandoned web payments were inflating revenue + transaction counts
and confusing staff who saw "Voided" rows in the sales report. Pending-payment
management lives in CustomersTab, so hiding them from the sales report is safe.

Note: `voided` itself is set by the web payment path
(`newStatus = result.success ? 'paid' : 'voided'`) — it is NOT related to the
claim-date (`bizDay`/`claimed_at`) bucketing change. Customer/vehicle visit+spend
stats and loyalty counters were intentionally left on `<> 'refunded'` (separate concern).
