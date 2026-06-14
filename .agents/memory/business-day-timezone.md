---
name: Business day = Brunei, not UTC ticket_day
description: Why "today" in POS/cash reports must use Brunei created_at day, not the UTC ticket_day column
---

# Business day must be Brunei (UTC+8), not UTC ticket_day

The `orders.ticket_day` column is bucketed by **UTC** date (set on insert as
`(now() AT TIME ZONE 'UTC')::date`) and also drives daily ticket-code numbering.
Brunei is UTC+8 with no DST, so **UTC midnight = 08:00 Brunei**.

**Why this bites:** any report that defines "today" as `ticket_day = UTC today`
will, when viewed between 00:00–08:00 Brunei, resolve "today" to the *previous*
calendar date and show the whole prior Brunei day's sales/refunds. A cashier
opening a shift at ~07:45 Brunei saw yesterday's totals in the live cash report.

**The fix pattern (already applied to the POS daily/shift cash report + today's
orders list + admin shift detail):** scope by Brunei calendar day off
`created_at`, never `ticket_day`:
`date(created_at AT TIME ZONE 'Asia/Brunei') = (now() AT TIME ZONE 'Asia/Brunei')::date`.
For a JS-side day string from a timestamp, use `opened_at + 8h` then ISO date.

**How to apply / still-latent:** the admin date-range analytics still filter
`ticket_day BETWEEN from AND to` (UTC), so they keep the same ≤8h boundary skew
for orders created 00:00–08:00 Brunei. Leave ticket_day insert + ticket-code
numbering on UTC unless you also handle the daily-uniqueness constraint
(`orders_branch_ticket_day_uniq`) during the transition.
