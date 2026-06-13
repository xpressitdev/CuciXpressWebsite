---
name: Payment methods & qr_provider model
description: How "wallet" POS payment methods are represented (owner-definable provider slugs), and the unique-index landmine on pocket_pay.
---

# Payment method representation

The "wallet" payment methods are NOT distinct `payment_method` values. They are
stored as `payment_method='qr_code'` plus a `qr_provider` discriminator slug, e.g.:

- `pocket_pay`         → online self-checkout (Pocket Pay callback flow) — RESERVED, see below
- `pocket_pay_qr`      → manual POS counter "Pocket Payment QR"
- `pocket_pay_invoice` → "Pocket Payment Invoice"
- `baiduri_ms`         → "Baiduri MS Payment Request"
- `dst_easy` / `quickpay` → "Quickpay" (synced/legacy)
- owner-added wallets (e.g. `progresif_ding`) → humanised from the slug

# Wallet providers are OWNER-DEFINABLE (no hardcoded allowlist)

Wallet providers are free-form slugs the owner creates in Admin → Payment Setup.
The form auto-derives the slug from the label (`"Progresif Ding!"` → `progresif_ding`).

**Rule:** validate `qr_provider` as a slug `^[a-z0-9_]+$` (1–40 chars), reject only
the reserved literal `pocket_pay`. This same shape must hold in BOTH the admin
payment-methods schema AND the POS order-create schema (`posOrderSchema`) in
`server/routes.ts`, and the POS checkout must pass the configured provider straight
through (no static allowlist filter).

**Why:** there used to be a hardcoded enum `ALLOWED_QR_PROVIDERS` duplicated in
`server/routes.ts` and `client/src/pages/pos.tsx`; the POS silently coerced any
provider outside it to `NULL` at checkout, so an owner-added wallet looked
selectable but recorded `qr_provider = NULL`, corrupting attribution. It also made
the self-service "Payment Setup" UI a lie — the button enabled but the backend
rejected the save with a misleading "pocket_pay reserved" toast (a false substring
match in `describeError` against the zod enum text `...pocket_pay_qr...`). The DB
always allowed it: `orders.qr_provider` is free text and `payment_methods` only has
`CHECK (qr_provider <> 'pocket_pay')` + `UNIQUE(method, COALESCE(qr_provider,''))`.

**How to apply:** to add a wallet, just create it in the UI — no code change. When
labeling an unknown non-NULL provider in reports/receipts, humanise the slug
(`progresif_ding` → "Progresif Ding"); keep NULL provider as the legacy
"Pocket Payment QR" default so old data isn't relabelled.

# qr_provider also distinguishes Bank Transfer (BIBD vs Baiduri)

`qr_provider` is NOT qr_code-only. Two configured `bank_transfer` methods ("Bank
Transfer BIBD" `bibd`, "Bank Transfer Baiduri" `baiduri`) reuse the same column to
discriminate banks, so `(method, qr_provider)` resolves to the owner's configured
label in reports. The POS order INSERT historically stored `qr_provider` ONLY when
`payment_method='qr_code'` — it now also stores it for `bank_transfer`. Legacy bank
orders have NULL provider (bank unrecoverable) and fall back to generic "Bank
Transfer". The Order Report resolves labels from a `payment_methods` config map
keyed `${method}|${qr_provider??''}` (no JOIN, to avoid fan-out); humanise-the-slug
fallback is scoped to `qr_code` only, because non-qr providers like
`subscription|membership` / `voucher|loyalty` are semantic tags, not wallet names.

# The pocket_pay unique-index landmine

There is a partial unique index `idx_orders_pocket_pay_payment_ref` on
`orders(payment_ref) WHERE qr_provider='pocket_pay' AND payment_ref IS NOT NULL`.
It exists for **online Pocket Pay callback idempotency only**.

**How to apply:** never write `qr_provider='pocket_pay'` for manual/counter entries
that may carry a human-entered `payment_ref` — duplicate refs throw a 23505 that
the POS create handler misreports as a ticket collision. Manual POS Pocket QR uses
`pocket_pay_qr` precisely to stay out of this index.
