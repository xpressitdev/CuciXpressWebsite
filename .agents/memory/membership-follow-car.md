---
name: Membership follows car only via owner Plate Transfer
description: Policy for moving unlimited memberships when a plate changes hands
---
Active `kind='unlimited'` memberships move to the target customer ONLY through the owner-gated POST /api/admin/plate-transfer (in the same db.transaction as the cars update). Detach leaves the membership on the payer.

**Why:** Self-service plate claims (registration, add-vehicle) only prove the plate was *unclaimed*, not ownership — auto-moving a paid membership there would let anyone who registers with a detached plate steal the entitlement. Prepaid wash packs are excluded on purpose. Billing `subscriptions` rows never move (bound to whoever paid; Pocket Pay subs have no auto-recurring charge anyway).

**How to apply:** To hand a subscribed car to a new person: detach → they register & claim the plate → owner runs Plate Transfer to their customer row (moves the membership even if they already own the car). Don't add membership moves to claim flows; the phone-verified walk-in adoption path in POST /api/customer/cars is the one sanctioned exception.
