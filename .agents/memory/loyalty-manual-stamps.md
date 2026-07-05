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

**Two redeem paths, one eligibility pool (keep in lockstep):**
`/api/customer/loyalty/redeem` (Lucia, car-owned only) creates a BRANCHLESS voucher
the customer scans later. `/api/pos/loyalty/redeem` (staff owner/manager/cashier)
consumes the same 4 stamps but QUEUES the free wash immediately — voucher order is
inserted already `status='queued'` with `branch_id` + `ticket_code` (allocated with
the verify-qr `MAX(digits)+1`, `T-NNN`, UTC `ticket_day` algorithm) + `claimed_at`.
Both use the identical eligibility filters/attribution; if you change one, change both.
Staff path also short-circuits: if a pending loyalty voucher (paid, ticket_code NULL)
already exists for the car/plate it queues THAT one instead of consuming new stamps.
**Why:** staff claim is for a car physically at the lane, so it skips the scan step.
`loyalty_redemptions.customer_user_id` was made NULLABLE (2026-07-05_01) because staff
can claim for a walk-in plate with no user account — customer path always has one.

**Access: owner/manager/cashier.** Both /api/pos/loyalty/lookup and /stamp are
`requireStaffRole('owner','manager','cashier')` (lane excluded). The shared
LoyaltyStampTab is reused in both the admin Loyalty tab and a POS header dialog;
it is cashier-aware via useStaffAuth (canPickBranch = owner|manager). Cashiers
don't pick a branch — the picker and the owner/manager-only /api/admin/branches
query are gated to canPickBranch, and the server pins the credit to the cashier's
own staff.branchId (body branch_id ignored). The POS button is hidden from lane.

**Branch-lock:** POST /api/pos/loyalty/stamp must resolve a non-null, existing
branch before insert (400 `no_branch` / `invalid_branch`). Owners have
branchId=null, so the admin tab makes them pick a branch (required) and sends
`branch_id`; the server treats owner as privileged. The credit row carries
branch_id for audit.

**Removal:** DELETE /api/pos/loyalty/stamp/:id (owner/manager/cashier). A credit
is removable ONLY when nothing has been used toward a redeemed reward
(`stamps_remaining === stamps_total`) — re-checked atomically in the DELETE WHERE
so a racing redeem can't slip a partly-used credit out. Cashiers are branch-locked
(can only remove their own branch's credit); owner/manager remove any. Auto-counted
real orders are never removable (they're real services). The lookup returns a
`manual_entries[]` audit list with a server-computed `deletable`+`reason` per row;
the UI shows Remove only when the server says deletable — never trust a client flag.
**Why:** deleting a consumed credit would retroactively unwind a free wash the
customer already claimed, breaking the redemption pool.

**Why:** owner wants a full audit trail (who/when/branch/note/receipt) and the
migration means past washes are already auto-counted — the tool only tops up the
gap, so checking the current count before adding is the intended flow.
