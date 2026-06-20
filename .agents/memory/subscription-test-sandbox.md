---
name: Subscription test sandbox isolation
description: How the owner-only CyberSource test-subscription sandbox stays invisible to all live surfaces.
---

# Owner-only CyberSource subscription test sandbox

Owner-only admin tab + `/api/admin/subscription-test/*` routes let the owner run a
real CyberSource recurring-billing flow on the TEST gateway without touching live data.

## Isolation rule (why test subs never leak)
Test subscriptions are written with `is_test=true`, `membership_id=NULL`,
`user_id=NULL`, `customer_id=NULL`.

**Why this is sufficient (no `is_test` filter needed anywhere):**
- The live subscription **revenue report** reads the `memberships` table (kind='unlimited'),
  NOT the `subscriptions` table — a sub with no membership contributes nothing.
- `/api/subscriptions/me` filters by `user_id` — NULL user means no customer ever sees it.
- POS / loyalty key off memberships + customers — none exist for test subs.
- The renewal worker (`renewDueOnce`) still auto-renews them (scans by status +
  next_billing_at) but guards membership work behind `if (s.membership_id)`, so NULL is safe.

**Why NULL user_id matters:** `subscriptions_one_live_per_user` is a partial unique index
on `user_id` (status in active/past_due/incomplete). Postgres treats NULLs as distinct, so
the owner can create many test subs without colliding.

## Hard test-gateway guard
`isCyberSourceTestMode()` (server/cybersource.ts) is true only when HOST is
apitest.cybersource.com. All sandbox routes return 409 `not_in_test_mode` unless true —
so flipping `CYBERSOURCE_ENV` to prod can never let the sandbox charge a real card.

**How to apply:** if you add more sandbox endpoints, gate them with both
`requireStaffRole('owner')` AND `isCyberSourceTestMode()`, and keep test rows membership-less
with NULL user/customer so the isolation invariant holds.
