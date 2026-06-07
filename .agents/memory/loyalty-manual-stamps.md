---
name: Loyalty manual stamps
description: How manually-credited loyalty stamps coexist with auto-counted real orders, and the one attribution rule all readers must share.
---

# Loyalty manual stamps (digital-receipt backstop)

Loyalty = collect 4 paid B$12 (`pkg_basic_tyre_wax`) washes -> 1 free wash, counted
PER CAR. Baseline comes from real `orders` (where `loyalty_consumed_in IS NULL`).
`loyalty_manual_stamps` exists so a branch-locked cashier can credit stamps a
plate's physical receipts that didn't auto-count (plate typo / walk-in plate).

**Rule: total = eligible real orders + SUM(manual stamps_remaining where >0).**
Manual stamps add ON TOP — never replace auto-count, or you double-count.

**Attribution rule (MUST be identical in all three readers + redeem):**
`vehicle_id` FK match wins; plate-normalized fallback ONLY when the row's
`vehicle_id IS NULL`. `plate_norm = UPPER, strip whitespace`. The three readers:
`/api/pos/loyalty/lookup`, `/api/customer/loyalty` (manual CTE), and the redeem tx.
If you change one, change all — drift means a plate shows a different count
depending on where you look.

**Redeem consumption order:** real orders first, then manual `stamps_remaining`
oldest-first, all under `FOR UPDATE` (car row + orders + manual rows) so concurrent
redeems for the same car serialize and can't over-consume.

**Access: OWNER-ONLY.** Both /api/pos/loyalty/lookup and /stamp are
`requireStaffRole('owner')`, and the UI lives in an owner-only admin tab
(LoyaltyStampTab), NOT the cashier POS. (Owner explicitly pulled this off cashiers
— it's an audit-sensitive credit action.)

**Branch-lock:** POST /api/pos/loyalty/stamp must resolve a non-null, existing
branch before insert (400 `no_branch` / `invalid_branch`). Owners have
branchId=null, so the admin tab makes them pick a branch (required) and sends
`branch_id`; the server treats owner as privileged. The credit row carries
branch_id for audit.

**Why:** owner wants a full audit trail (who/when/branch/note/receipt) and the
migration means past washes are already auto-counted — the tool only tops up the
gap, so checking the current count before adding is the intended flow.
