---
name: Claim-date revenue realization
description: Web Pocket Pay orders bucket by claim day (claimed_at), not paid day; any new revenue query must use bizDay()
---

# Claim-date revenue realization

Web checkout orders are PREPAID via Pocket Pay on cucixpress.com
(`qr_provider = 'pocket_pay'`). The customer can pay one day and scan the wash QR
at the lane on a different day. Revenue is realized on the **claim (QR-scan) day**,
not the paid day.

**Rule:** every order-revenue bucketing query (POS "Today", dashboard summary +
hourly + fee groups, orders report + export, payment-methods, best-selling, trends
daily-series + heatmap + totals, shift/cash totals) must bucket by the
`bizDay()` helper in `server/routes.ts` (top of `registerRoutes`):
`CASE WHEN qr_provider='pocket_pay' THEN claimed_at ELSE created_at END`
(prefix `''` or `'o.'` to match the query alias). In-store orders keep `created_at`.

`orders.claimed_at` (nullable timestamptz) is stamped once on QR scan in verify-qr
via `claimed_at = COALESCE(claimed_at, now())`.

**Why:** the user explicitly wants prepaid web washes counted on the day the wash
is actually delivered (scanned), so daily cash/sales reports match physical
activity at the lane.

**How to apply:**
- Any NEW revenue/sales query you add MUST use `bizDay()`, never bare `created_at`,
  or web orders will land in the wrong day.
- Operational (non-revenue) queries stay on `created_at`: live queue snapshot,
  avg wash time, customer registrations, washes_this_month.
- Unclaimed web orders have `claimed_at = NULL` ⇒ `bizDay()` is NULL ⇒ they drop
  out of every day bucket until scanned. This is intended ("realize on claim").
- Known acceptable caveat: a web order refunded BEFORE it was ever claimed has
  `claimed_at = NULL`, so it won't appear in any refund day bucket. Revisit only if
  business wants pre-claim refunds tracked.
- Backfill at rollout only stamped already-claimed web orders
  (`ticket_code IS NOT NULL`) so historical totals stayed identical.
