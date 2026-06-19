---
name: Customer add-vehicle must claim, not insert
description: Why POST /api/customer/cars has to claim an existing unclaimed plate row instead of inserting a new one
---

Adding a vehicle from the customer dashboard cannot blindly INSERT a new `cars` row.

**Why:** `cars_plate_normalized_unique` allows only ONE row per normalized plate. A plate is very often already in `cars` as an unclaimed walk-in created at the POS (`user_id` AND `customer_id` both NULL). A second INSERT for that plate throws Postgres 23505, which surfaced to customers as a generic "Could not save vehicle." 500.

**How to apply:** The three existing guards partition the single-row space and must run in this order:
1. self-owned (`user_id = me OR customer_id = mine`) -> 409 `duplicate_plate`
2. owned by another (`user_id IS NOT NULL OR customer_id IS NOT NULL`) -> 409 `plate_claimed`
3. otherwise CLAIM the unclaimed row with an **atomic** `UPDATE ... WHERE normalized = plate AND user_id IS NULL AND customer_id IS NULL` (the WHERE re-checks "still unclaimed" so concurrent claims can't both win), COALESCEing customer-entered brand/model/color/photo over existing values (blank input keeps POS data). If 0 rows updated, INSERT new.

Always keep a catch for residual 23505 (race between check and write) and resolve it into a deterministic 409 (mine -> duplicate_plate, else plate_claimed) rather than a 500. Claiming an unclaimed plate is intentional — the plate is the identity; the cross-user guard already blocks taking over a registered owner's car.
