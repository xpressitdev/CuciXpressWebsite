---
name: Payment methods & qr_provider model
description: How "wallet" POS payment methods (Pocket QR/Invoice, Baiduri MS) are represented, and the unique-index landmine on pocket_pay.
---

# Payment method representation

The "wallet" payment methods are NOT distinct `payment_method` enum values.
They are stored as `payment_method='qr_code'` plus a `qr_provider` discriminator:

- `pocket_pay`         → online self-checkout (Pocket Pay callback flow)
- `pocket_pay_qr`      → manual POS counter "Pocket Payment QR"
- `pocket_pay_invoice` → "Pocket Payment Invoice"
- `baiduri_ms`         → "Baiduri MS Payment Request"
- `dst_easy` / `quickpay` → "Quickpay" (synced/legacy)

The server reporting `paymentLabel(pm, qrProvider)` (in `server/routes.ts`) is the
source of truth for turning these into display labels; the qr_code default falls
back to "Pocket Payment QR". `qr_provider` is free text — there is NO CHECK
constraint, so adding a new wallet method needs no DB migration.

**Why:** synced data (KedaiPOS) and reports already model these via qr_provider, so
the POS must match to keep aggregation/reconciliation consistent. Inventing new
`payment_method` enum values would also break the `orders_payment_method_check`
CHECK constraint and split a single logical method across two representations.

# The pocket_pay unique-index landmine

There is a partial unique index `idx_orders_pocket_pay_payment_ref` on
`orders(payment_ref) WHERE qr_provider='pocket_pay' AND payment_ref IS NOT NULL`.
It exists for **online Pocket Pay callback idempotency only**.

**How to apply:** never write `qr_provider='pocket_pay'` for manual/counter entries
that may carry a human-entered `payment_ref` — duplicate refs throw a 23505 that
the POS create handler misreports as a ticket collision. Manual POS Pocket QR uses
`pocket_pay_qr` precisely to stay out of this index.
