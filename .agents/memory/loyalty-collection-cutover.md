---
name: Loyalty collection cutover
description: How a "reset all loyalty stamps / start collecting from date X" request is enforced without deleting order history.
---

# Loyalty stamp collection reset = date cutoff, not deletion

**Rule:** To "clear everyone's stamps and start fresh from a date", do NOT delete
or mutate orders. Instead define a single `LOYALTY_COLLECTION_START` constant
(a UTC instant) in `server/routes.ts` near `LOYALTY_PKG_ID` and append
`created_at >= ${LOYALTY_COLLECTION_START}` to the AUTO-count eligibility queries
ONLY. Pre-cutover qualifying washes then stop earning auto stamps, but order
history, reports, and customer dashboards stay intact.

**Why:** Order rows are the source of truth for reports/customer history and are
mirrored to SharePoint. Deleting/zeroing them to reset stamps would destroy
reporting. A read-time filter is reversible and side-effect-free. Old physical
receipts must still be honorable, so the OWNER manual-stamp path must stay
UN-filtered.

**How to apply:** There are exactly FOUR auto-count readers that must all get the
cutoff in lockstep (or the customer dashboard, POS lookup, redeem, and stamp
recompute will disagree, letting pre-cutoff washes still count somewhere):
1. `/api/customer/loyalty` eligible CTE
2. `/api/customer/loyalty/redeem` `eligibleRows` (the FOR UPDATE selection of
   orders to consume — filtering here is what blocks consuming a pre-cutoff order)
3. `/api/pos/loyalty/lookup` auto count
4. `/api/pos/loyalty/stamp` recompute auto count

Do NOT filter: the `manual`/`manualRows` manual-stamp CTEs, the consume-by-id
UPDATE (operates on already-filtered ids), the pending-voucher CTE, or the
`membership_redemptions` subqueries. Brunei is UTC+8, so local midnight June 14
= `2026-06-13T16:00:00Z`; use `>=` to include the boundary instant. Note: the
imported historical orders don't even use `pkg_basic_tyre_wax`, so pre-cutover
auto stamps are doubly zero — but keep the date filter as the explicit guarantee.
