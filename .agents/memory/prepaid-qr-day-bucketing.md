---
name: Prepaid-QR day bucketing (bizDay)
description: Why every prepaid-QR order type must bucket by claim day, and which readers must stay in lockstep, or scanned washes vanish from "today".
---

# Prepaid-QR day bucketing

Prepaid-QR orders create the `orders` row up front (when the customer opens
their QR) and are only redeemed when staff scan it at the lane (`claimed_at`
set then). Three providers behave this way: `pocket_pay` (web checkout),
`loyalty` (free-wash voucher), `membership` (subscription / unlimited wash).
An in-person POS order has no QR — its business day is `created_at`.

**Rule:** the `bizDay()` helper AND the public `queue/snapshot` date filters
must bucket all prepaid-QR providers by their claim/scan day, not `created_at`.

- `pocket_pay` → bare `claimed_at` (real money; an unclaimed paid web order
  must stay OUT of every day bucket = revenue realized on claim).
- `loyalty` / `membership` → `COALESCE(claimed_at, created_at)` (B$0, and some
  legacy rows were scanned before `claimed_at` was recorded, so they fall back
  to `created_at` to avoid dropping historical washes from reports).
- in-person → `created_at`.

**Why:** a staff report ("scanner not adding the subscription QR to the queue
or sales log") was caused by `bizDay()` only special-casing `pocket_pay`, so a
membership wash whose QR was generated on one day and scanned on another
bucketed to its QR-gen day — disappearing from the scan day's queue snapshot,
POS `orders/today`, and admin reports. The `queue/snapshot` separately filtered
on raw `created_at`.

**How to apply:** when adding a new prepaid/QR-redeemed order type, add it to
`bizDay()` and keep ALL day-bucket readers in lockstep — `bizDay()` usages,
the `queue/snapshot` active + done-total filters, and any new "today" reader.
Decide deliberately between bare `claimed_at` (drop unclaimed; right for money)
vs `COALESCE` fallback (keep historical; fine for B$0).
