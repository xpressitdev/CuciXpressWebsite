---
name: Sales/refund report accounting (gross vs net)
description: How POS sales reports must treat refunded orders so net = sales - refunds ties out, incl. live vs legacy refund lineage
---

# Sales/refund accounting in POS reports

**Rule:** gross "sales_cents" (the base that a `net = sales - refunds` display subtracts from)
must count a refunded order's total ONLY when it is a LIVE refund; a LEGACY (imported)
separate-row refund must be EXCLUDED from gross. Encoded in the `grossSalesCents(prefix)`
helper in `server/routes.ts`:
`SUM(CASE WHEN status <> 'refunded' OR legacy_source IS NULL THEN total_cents ELSE 0 END)`.
Then `net = grossSalesCents - refundTotal`.

**Why (two different refund shapes):**
- LIVE refund = the ORIGINAL order is flipped in place to `status='refunded'` (ONE row,
  `legacy_source IS NULL`). The money was collected, so its total belongs in gross; subtracting
  refunds nets that one transaction to $0.
- LEGACY refund = the KedaiPOS/Power BI sheet records a refund as a SEPARATE positive-total
  reversal row sitting ALONGSIDE its original `done` sale row (both imported; the DB CHECK
  forbids negative totals, `legacy_source='sharepoint'`). If the refund row is counted in gross,
  subtracting refunds only cancels the refund row and leaves the ORIGINAL sale still counted —
  net stays too high by exactly the refund total.
- History: an earlier bug did the opposite (gross EXCLUDED all refunded via `status<>'refunded'`
  while net still subtracted refunds → live refunds double-counted negatively). "Include all
  refunded" fixed that but then over-counted legacy once imports landed. `grossSalesCents` is the
  only rule correct for BOTH, and it ties the admin Order Report to Power BI to the cent
  (master range 26/12/2021–30/04/2026: gross 127147799, refund 1467273, net 125680526 =
  B$1,256,805.26).

**How to apply:**
- Any range report whose net subtracts refunds must build its gross with `grossSalesCents(...)`:
  Order Report totals, Payment Methods report (both share it now). Keep `refund_total_cents` as
  `SUM(total_cents) FILTER status='refunded'`.
- MDR fee is charged on gross (provider keeps its cut even on refunds). `grossSalesCents` already
  counts each original charge exactly once, so call `mdrFeeForGroup(bps, grossSales, 0)` — pass 0,
  never `+ refund`, or legacy refunds double the fee base.
- Cash drawer (`computeShiftTotals`): `expected_cash = float + cashSales - cashRefunds` and its
  net still use `SUM(total_cents)` incl refunded. That is fine for LIVE-only days (shift/daily
  reports are live ops); it would over-count only a historical LEGACY day view — not migrated
  because it risks the cash-reconciliation math. Revisit only if a legacy day report is shown.
- Trends report (daily series / by-branch / heatmap) uses `SUM(status<>'refunded')` as a
  gross-before-refunds figure for CHARTS and does NOT compute a net headline, so it's left alone.
  If it ever needs a cent-exact net, switch it to `grossSalesCents` too (its current basis is
  wrong for LIVE refunds if you subtract refunds from it).
- Excel export (`/reports/orders/export`) writes raw per-order rows with an "Is Refund" flag and
  POSITIVE totals; Power BI aggregates it. Not an aggregation surface — untouched.
- Admin Order Report tiles (date-range) are a deliberate WATERFALL, owner's definition:
  Net Sales = GROSS (`sales_cents` = grossSalesCents, BEFORE refunds);
  Net Revenue = `sales_cents - refund_total_cents`;
  Net After Fees = `net_after_fees_cents` (= Net Revenue − MDR). Do NOT "fix" Net Sales back to
  `net_sales_cents` — the owner wants Net Sales to be the pre-refund gross so the three tiles read
  gross → (minus Total Refunds) → net revenue → (minus fees) → net after fees. The Today dashboard
  uses different labels (Today's Sales = gross, its "Net Sales" = after refunds) — separate scheme.
