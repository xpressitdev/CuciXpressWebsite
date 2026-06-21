---
name: Website checkout receipt email
description: How the public web (Pocket Pay) self-checkout receipt + QR email is sent, and why it must stay server-side.
---

# Website checkout receipt email

For public web self-checkout orders (`qr_provider='pocket_pay'`), the receipt
email (HTML receipt + an inline server-generated payment QR) is sent
**server-side only**, claimed atomically via `orders.receipt_email_sent_at`.

Two triggers both call the same helper (`sendReceiptEmailIfUnsent`):
1. `/api/payment-callback` after the pending→paid flip (awaited).
2. `/api/payment-success-order` (secret-gated by `successIndicator`) fires it
   fire-and-forget when the order is already `paid` — recovery for a transient
   callback email failure.

The helper does an atomic claim: `UPDATE orders SET receipt_email_sent_at=now()
WHERE ... AND receipt_email_sent_at IS NULL RETURNING ...`. Only the claim winner
sends; on send failure (false return OR throw) it **releases** the claim
(`receipt_email_sent_at=NULL`) so a later trigger retries. Never throws.

**Why:** the original bug was a client-side email in PaymentSuccess.tsx that
fired before the real order was loaded → receipts showed plate "UNKNOWN" / phone
"N/A", had no server QR, and could fire on unconfirmed payments. NEVER re-add a
client-side email send.

**How to apply:** any change to web receipt delivery goes through the helper +
the claim marker. Email is required at web checkout (`orders.customer_email`,
`.notNull()` is NOT set since walk-in/POS orders have none — it's nullable;
web checkout validates it route-side). `users.email` IS `.notNull()`, so
logged-in customers always have an address.

**Success page must verify real status — never optimistic.** `/payment-success`
(PaymentSuccess.tsx) MUST gate the green "confirmed" screen on the server's real
`order_details.status === 'paid'` (via secret-gated `/api/payment-success-order`).
**Why:** it used to show "confirmed" + wash QR purely from landing on the success
URL (trusting the redirect / sessionStorage), so a VOIDED/never-captured payment
still rendered success — staff could be shown a QR for an unpaid wash (value
leakage). It polls ~6×2s while `pending_payment` to absorb the redirect-vs-callback
race, then fails safe. NEVER reintroduce an optimistic "trust the redirect" path,
and keep `order_details.status` in that endpoint's response contract.

**Known limitation (follow-up, not a bug in this flow):** if Pocket Pay never
delivers the callback, the order never reaches `paid`, so no email — same gap as
the order never being finalized at all. A true delivery guarantee needs an outbox
state machine (pending/sending/sent/failed + retry worker) plus server-side
Pocket Pay status reconciliation keyed by OrderId. Out of scope for the receipt
feature itself.
