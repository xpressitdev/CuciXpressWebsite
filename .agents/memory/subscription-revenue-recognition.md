---
name: Subscription revenue recognition
description: How subscription (unlimited/family) revenue is recognized daily and why it is kept out of the main sales reports.
---

Subscription purchases (B$60 Unlimited Xpress, B$150 Multi-Car Family) are NOT
recorded as orders — they live only in the `memberships` table (kind='unlimited',
`price_cents`, `created_at`, `expires_at`). Their purchase revenue therefore never
reaches the dashboard / payment-methods / orders reports / SharePoint; only the B$0
free-wash redemptions do.

The admin Subscription tab shows a *separate* revenue-recognition view computed at
read time from `memberships` (endpoint: subscription revenue, owner/manager only):

- Take the web Pocket QR gateway MDR (`qr_code` / `pocket_pay` rate, currently 3.5%)
  ONCE at purchase on the gross, then spread the NET evenly over a FIXED 30-day
  window measured from each sale's own `created_at` (purchase day = day 1).
- `recognized = round(net * clamp(elapsedDays,0,30) / 30)`.
- `earned_today = recognized(elapsed) - recognized(elapsed-1)` using the UNCLAMPED
  elapsed day, so it correctly drops to 0 once the 30-day window closes. (Clamping
  elapsed before the delta is a bug — earned-today never zeroes out.)

**Why:** owner wants accrual-style revenue, MDR taken upfront, and this number must
stay isolated from operational sales totals (mixing spread-out subscription income
into daily wash sales is misleading).

**How to apply:** if you add online subscription checkout or new plans, keep the
recognition isolated to this endpoint/tab; period is always 30 days regardless of
`expires_at` or cancellation (no refunds — recognize all 30 days even if cancelled).
