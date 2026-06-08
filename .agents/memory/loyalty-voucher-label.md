---
name: Loyalty voucher reward label
description: Why redeemed 5th-free-wash orders carry a distinct display name but keep the qualifying package_id
---

A redeemed loyalty free wash is written as an order whose **display name differs from its package_id**.

- The voucher order row snapshots `package_name = "5th Free Wash"` (reward label) but keeps `package_id = <qualifying package, e.g. pkg_basic_tyre_wax>` and price 0, `payment_method = voucher`, `qr_provider = loyalty`.
- The customer loyalty API returns **two** distinct fields: `package_name` = the *qualifying* paid package the customer must buy to earn stamps ("every paid X earns a stamp"), and `reward_name` = the *free wash* label shown on the voucher. Do not collapse them — they mean different things.

**Why:** the cashier order summary / receipt / reports should read as the reward ("5th Free Wash"), not as the paid package it was earned from, while eligibility counting still keys on `package_id`. Keeping `package_id` intact preserves stamp attribution and report linkage.

**How to apply:** if you ever change either label, keep order-row `package_name` and the API `reward_name` in lockstep. The best-selling report groups by `(package_id, package_name)`, so this intentionally surfaces redeemed washes as their own B$0 "5th Free Wash" line instead of inflating the paid package's count — that split is desired, not a bug.
