---
name: Daily Report / shift totals = shared drawer per branch+day
description: Why cashier shift totals are scoped by branch+day, not by shift_id
---

Cash drawer reconciliation (Daily Report, shift close, admin shift detail) totals
the branch's whole day, NOT one cashier's shift.

**Rule:** `computeShiftTotals` aggregates orders by `branch_id` + day (the day
bucket matches `orders.ticket_day`, which is set in UTC on insert). Live views
(current shift, close) use today derived in DB time; admin historical detail
passes the shift's own opened day. Opening float still comes from the viewing/
closing shift.

**Why:** Each branch runs ONE shared cash drawer per day — every cashier rings
into it and the cash is banked daily (next day = fresh sales). Owner confirmed
this. The old per-`shift_id` scoping split a branch's cash across multiple open
shifts, so whoever opened a second/stale shift saw only their own slice and the
number looked wrong.

**How to apply:** Any new cash/drawer report must scope by branch+day. Don't
reintroduce shift_id-based totals. Orders still carry `shift_id` for audit only.

**Open risk:** Multiple open shifts per branch can each close and reconcile
against the same full-day totals (duplicate close records). No one-open-shift-
per-branch / single-close-authority rule exists yet. Stale never-closed shifts
are the usual cause; closing them is a manual DB/owner action.
