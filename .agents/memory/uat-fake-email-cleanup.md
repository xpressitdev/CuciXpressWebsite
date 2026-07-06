---
name: UAT fake-email accounts trap real customers
description: How to safely fix/clean @cucixpress.local shell accounts blocking real customer login + plate claims
---

Some plates are owned by fake UAT shell accounts with `@cucixpress.local` emails
(pattern `phone-<number>@cucixpress.local`). A real customer behind such a plate
cannot register or claim it because the plate is already "owned".

**Key safety fact:** all order / loyalty / Gold-tier history follows
`vehicle_id` (the car row) / normalized plate, NOT the `users`/`customers` row.
The shell accounts themselves have zero orders, memberships, subscriptions,
loyalty, achievements, or service history. So renaming or deleting the shell
never loses history.

**Two safe fixes:**
- Keep account: `UPDATE users SET email='<real>' WHERE id=<shell>` (login id =
  `users.email`). Customer logs in immediately, keeps everything. Simplest.
- Free the plate: `UPDATE cars SET user_id=NULL, customer_id=NULL` (both-NULL =
  claimable per claim-on-login), then delete the shell `customers` row, then the
  `users` row. Lets them self-register and re-claim.

**Delete ordering / FK notes:** delete `customers` before its `users` row;
detach or delete a customer's `cars` first (cars.customer_id → customers.id).
Tables referencing `cars.id`: orders, memberships, lpr_attempts,
loyalty_manual_stamps — check all are 0 before deleting a car. Also clear
`auth_sessions WHERE user_id=<id>::text`. Wrap in a single BEGIN/COMMIT with
`ON_ERROR_STOP=1`.

**Why:** dev `DATABASE_URL` IS the live prod Neon DB and prod data changes are
NOT covered by Replit checkpoint rollback — get explicit user sign-off on scope
before executing, and verify row counts after.
