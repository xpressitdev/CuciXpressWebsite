---
name: Subscription membership car binding
description: Why one-time subscription memberships must bind to a vehicle_id, and how Family multi-car valuation is split.
---

# Subscription unlimited membership ↔ car binding

The one-time Pocket Pay subscription funds `memberships.kind='unlimited'` rows.

## Rule 1: unlimited memberships MUST have a vehicle_id
The lane redemption flow rejects an active unlimited membership that has no
linked vehicle (`membership_no_vehicle`), because the wash order needs a plate
(`orders.plate` is NOT NULL). A membership created with `vehicle_id = NULL` is
silently unusable.

**Why:** the B$39 Unlimited wash is per-CAR, not per-customer — a customer can
own several cars.
**How to apply:** any path that creates an unlimited membership (Pocket Pay
finalizer, CyberSource confirm, POS) must resolve/create a car and set
`vehicle_id`. Plate is captured at checkout-start, persisted on
`subscriptions.car_plate`, and resolved in the callback finalizer.

## Rule 2: Family (multi-car) valuation
Family covers up to `maxVehicles` cars → one unlimited membership PER car, but a
SINGLE payment. Attribute the full plan price to the PRIMARY (first) membership
and `price_cents = 0` to the extra cars.

**Why:** `memberships.price_cents` feeds revenue + liability reports. Writing the
full B$99 to each of 3 rows would triple-count the sale.
**How to apply:** keep `SUM(memberships.price_cents)` for a subscription equal to
the one amount actually charged.

## Ownership guard
The start route rejects (`409 plate_in_use`) a plate already owned by a different
user/customer so a payer can't bind a membership to someone else's car. Unclaimed
walk-in cars (user_id+customer_id NULL) are claimed on finalize.

## Rule 3: renewal follows the explicit covered plate set
Every billing, cancellation, and expiry transition must update all per-car
memberships selected for the subscription, not only its primary membership.
Never infer that set from every car owned by the customer.

**Why:** Family has one subscription/payment but multiple vehicle entitlements;
updating only the primary car leaves extra cars active after cancellation or
expired after a successful renewal. Inferring all owned cars grants coverage that
was never purchased.

**How to apply:** persist the normalized selected plates on the subscription and
use that explicit set plus the primary membership anchor for lifecycle updates.
