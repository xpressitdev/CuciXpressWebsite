---
name: Counter-pass revenue recognition
description: How POS-sold Unlimited pass money is split between cash tallies and earnings reports
---

Counter-sold Unlimited passes (B$39 at POS) are rung as normal paid orders marked `orders.order_type = 'counter_subscription'`.

**Rule:** cash drawer / shift totals / payment-method report keep the full lump sum (money collected that day). Lump-sum EARNINGS surfaces (dashboard tiles, order-report totals + MDR fee groups, best-selling, trends) exclude these orders via the `excludeSubscriptionSales()` helper; revenue is instead recognized over 30 days by the subscriptions revenue endpoint, which spreads each counter-pass ORDER (renewals = separate orders) with MDR by actual payment method.

**Why:** owner wants drawer reconciliation exact, but monthly earnings comparable to online subs (which are already 30-day spread). Order rows/list/export stay unfiltered so the sale remains visible.

**Early renewals:** the membership extends from the OLD expiry (GREATEST(expires_at, now()) + 1 month) so the customer keeps remaining days; the revenue endpoint likewise CHAINS recognition windows per vehicle — a renewal's 30-day spread starts the day after the previous window ends, not on payment day.

**How to apply:** never classify passes by package_name text — use `order_type = 'counter_subscription'` (durable marker, backfilled by migrations/manual/2026-07-18_orders_order_type.sql, applied to dev+staging). Memberships with source='pos' are excluded from the memberships branch of the revenue query; the ORDERS drive counter recognition. Order Report tab shows a "Subscription Earnings (to <date>)" tile, owner/manager-gated in UI (endpoint role-gated).
