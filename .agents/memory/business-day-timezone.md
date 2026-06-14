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

**The fix pattern (applied to the POS daily/shift cash report, today's orders
list, admin shift detail, AND all admin date-range reports — dashboard,
orders, export, payment-methods, best-selling, trends incl. the daily-series
join):** scope by Brunei calendar day off `created_at`, never `ticket_day`:
`date(created_at AT TIME ZONE 'Asia/Brunei') = (now() AT TIME ZONE 'Asia/Brunei')::date`
(or `BETWEEN from AND to`). For a JS-side day string from a timestamp, use
`opened_at + 8h` then ISO date.

**Still on UTC (intentional):** `ticket_day` insert + ticket-code daily
numbering (don't change without handling the `orders_branch_ticket_day_uniq`
constraint during transition). The reports' SELECT of `ticket_day` is display-
only and unused by the frontend (it renders `created_at`).

**Note:** can't build an expression index on `date(created_at AT TIME ZONE
'Asia/Brunei')` — `AT TIME ZONE` is STABLE not IMMUTABLE, Postgres rejects it.
For sargability use a UTC range on `created_at` (Brunei-midnight bounds shifted
−8h) instead. At ~68k orders the functional predicate is fine for admin reports.
