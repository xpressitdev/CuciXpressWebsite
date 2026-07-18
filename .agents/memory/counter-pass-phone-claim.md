---
name: Counter-sold pass phone claim
description: How POS-sold Unlimited passes reach the buyer's online account, and the guards around phone-based claiming.
---

Counter-sold Unlimited passes create a WALK-IN customer row (user_id NULL) keyed by unique phone, linked to the car. When the buyer registers online, POST /api/customer/cars lets them claim a walk-in-held plate by matching the phone given at the till (409 `phone_match_required` → UI prompts → retry with `phone`).

**Rules that must not be weakened:**
- Phone is the ONLY proof of ownership, so wrong guesses are rate-limited per user+plate (5/15min, in-memory). Removing the limiter makes member plates brute-force claimable (free unlimited washes).
- POS sale 409s `phone_belongs_to_existing_customer` on a phone collision; cashier must resend with `confirm_existing_customer:true`. This stops a typo silently gifting a paid pass to the wrong account.
- Claim adoption is two-branched: user has no customers row → adopt the walk-in row (SET user_id, guarded WHERE user_id IS NULL); user already has one → re-point that vehicle's memberships + car to it. Both must stay atomic.

**How to apply:** any new "sell at counter, claim online later" entitlement should reuse this pattern (walk-in row + phone match + limiter + collision confirm), not both-NULL unclaimed cars.
