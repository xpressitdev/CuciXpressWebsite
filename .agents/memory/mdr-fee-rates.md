---
name: MDR transaction fee rates
description: How merchant-discount-rate (MDR) fees are modeled, keyed, and computed across the POS reports.
---

# MDR (merchant transaction fee) model

Owner-editable per-method fee rates live in table `payment_fee_rates`
(`payment_method`, nullable `qr_provider`, `mdr_bps`). Rate lookups across the
app key by the string `${payment_method}|${qr_provider ?? ''}`; a missing key
means 0 bps (so cash / bank_transfer need no seeded row — fallback-to-zero is
intentional, not a bug).

**Rule: the unique index must be NULL-safe.** Use
`(payment_method, COALESCE(qr_provider, ''))`, never a plain
`(payment_method, qr_provider)` index.

**Why:** Postgres treats NULL as distinct in a plain unique index, so a plain
index lets duplicate `(card, NULL)` / `(cash, NULL)` rows through. Duplicates
then collapse in the in-memory rate map (last-write-wins), making MDR fees
nondeterministic and defeating the CRUD duplicate guard (23505 → 409).

**How to apply:** Any new fee-rate-style table keyed on a nullable column needs
the COALESCE unique index, and matching `ON CONFLICT (col, COALESCE(nullable,''))`
in seeds. Owner decisions that shape the math: MDR is charged on GROSS
(`gross_charged = sales_cents + refund_cents`, fee stays on refunds); the
headline figure is `net_after_fees = (sales - refund) - total_mdr_fee`.
Fees are GROUP BY `(payment_method, qr_provider)` and rounded per group.
