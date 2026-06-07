---
name: Add-on line quantity & category
description: How POS sells add-ons in bulk (per-line qty) and categorizes them; why packages stay single-wash.
---

# Add-on line quantity & category

Packages are always a single wash — there is NO package-level quantity multiplier.
Bulk selling (e.g. wash vouchers, wipers) is done at the **add-on** level instead.

## Per-line quantity
- Add-on quantity lives **inside the order `addons` jsonb snapshot** (`OrderAddonSnapshot.quantity`), NOT as a column on `orders`.
- `quantity` is **optional** for backward compat: old snapshots lack it, so every reader must fall back to `?? 1`.
- Subtotal rule (must match across all readers): `package_price + Σ(addon.price_cents * qty)`.
- The three readers that must stay in lockstep: server subtotal calc, server snapshot build, and client receipt/confirmation display.
- API payload: `addon_ids` + optional `addon_quantities` map (backward compatible — clients may send only `addon_ids`).
- Subscription/free washes force every add-on qty to **1** (one car). Server is authoritative; the POS client mirrors this (hides the stepper and clamps display/subtotal to 1 when `paymentMethod === "subscription"`).

## Category
- Add-ons reuse the existing `categories` table via `addons_catalog.category_id` (FK `ON DELETE SET NULL`), mirroring `packages.category_id`. Category-in-use checks must UNION packages + add-ons.

## orders.quantity column drift
**Why:** a package-level quantity feature was reverted in code, but the `orders.quantity` DB column was deliberately LEFT in place (shared dev=prod Neon + possibly-deployed app → dropping is risky).
**How to apply:** the column still exists with DEFAULT 1; INSERTs simply omit it. Do not rely on it in app code, and do not try to drop it without explicit instruction.
