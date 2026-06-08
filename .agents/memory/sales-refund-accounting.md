---
name: Sales/refund report accounting (gross vs net)
description: How POS sales reports must treat refunded orders so net = sales - refunds ties out
---

# Sales/refund accounting in POS reports

**Rule:** every report's "sales_cents" (the gross figure) must INCLUDE refunded orders at
their original amount (`SUM(total_cents)` over ALL orders). The displays/derived totals then
do `net = sales - refunds` (and per-method `Total = Sale - Refund`). Net = realized revenue;
a create+full-refund cycle nets to $0.

**Why:** the long-standing bug was every aggregation computing sales with
`status <> 'refunded'` (EXCLUDING refunded orders) while net still subtracted refunds
separately — so a refunded order was removed from sales AND subtracted again as a refund,
counting it negatively twice. A $12 sale+refund dropped net by $12 instead of $0.

**How to apply:**
- Gross sales aggregations feeding a `sales - refund` net (dashboard tiles, range orders
  report, shift totals, payment-method report, dashboard hourly series) → use `SUM(total_cents)`
  over all orders. Net = `sales - refundTotal`.
- MDR fee is charged on gross (kept on refunds). `mdrFeeForGroup(bps, sales, refund)` returns
  `(sales+refund)*bps`. When `sales` is already gross, call `mdrFeeForGroup(bps, sales, 0)` so
  refunds aren't added twice. Where a separate feeGroups query still splits sales-excl + refund,
  the original `(bps, salesExcl, refund)` call stays correct (salesExcl + refund = gross).
- Cash drawer: `expected_cash = float + cashSales - cashRefunds` only ties out when `cashSales`
  is gross (includes refunded cash inflow).
- Counts: shift `sales_count = COUNT(*)` (gross) so `sales_count - refund_count` = realized count.
- Pure single-series "sales" trend/ranking reports (by-branch, by-dow, trends) that DON'T
  subtract refunds can stay on `status <> 'refunded'` — they show realized sales with no
  double-count. Only the surfaces that subtract refunds need the gross base.
