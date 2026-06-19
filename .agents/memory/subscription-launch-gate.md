---
name: Subscription launch gate
description: Why the Subscribe button shows lead-capture instead of CyberSource payment, and the full production cutover checklist.
---

# Subscription self-serve checkout is launch-gated

The customer Subscribe flow on the subscriptions page is gated behind a
**client-side launch countdown** (`LAUNCH_TS` in `client/src/pages/subscriptions.tsx`).
While `now < LAUNCH_TS`, `launched` is `false` and clicking Subscribe on a paid
plan routes to the **founding-spot lead-capture** step ("we'll text you at launch"),
NOT the CyberSource Unified Checkout payment widget. Once the timestamp passes,
the same button swaps to the live payment widget.

**Why:** This is intentional pre-launch behavior, not a bug. If a user reports
"clicking subscribe goes to lead collection, not payment," that is the gate working
as designed. Do NOT "fix" it by removing the gate unless the user is actually going
to production.

**How to apply — production cutover requires TWO switches, not one:**
1. **Launch gate:** move/adjust `LAUNCH_TS` so the launch moment has passed (so the
   payment widget shows instead of lead-capture).
2. **CyberSource prod:** generate fresh keys from the **Prod** Business Center,
   update the three secrets (`CYBERSOURCE_MERCHANT_ID`, `CYBERSOURCE_KEY_ID`,
   `CYBERSOURCE_SHARED_SECRET`), set `CYBERSOURCE_ENV=prod`, then **republish** so
   the live site picks up the new env/keys.

Sandbox/test verification of the payment path was already done end-to-end (capture
context + test cards) — the only thing standing between "test" and "real charges"
is the gate + the prod keys/env above.
