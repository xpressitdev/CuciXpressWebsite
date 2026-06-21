---
name: Prepaid web-wash QR lifecycle
description: How the online-paid walk-in wash QR flows from payment to POS claim, and why it is single-use.
---

# Prepaid web-wash QR (Pocket Pay walk-in)

A customer pays online for a B$8/B$12 walk-in wash. The order is created with
`payment_method='qr_code'`, `qr_provider='pocket_pay'`, `status='pending_payment'`,
then the payment callback flips it to `paid`. The QR encodes the minimal payload
`{ type:'CUCI_XPRESS_PAYMENT', order_id }` where `order_id === orders.payment_ref`
(the Pocket Pay order id). The same QR appears on the payment-success page AND in
the customer dashboard Activity tab.

## Single-claim is enforced server-side, not by the UI
`/api/verify-qr` allocates a `T-NNN` ticket and flips `paid -> queued` ONLY in the
guarded update `WHERE status='paid' AND ticket_code IS NULL`. Any re-scan returns
the existing ticket idempotently. So one paid order = exactly one wash, regardless
of how many times the QR is scanned or from how many surfaces it is shown.

**Why:** the customer can present the QR from the success page, the dashboard, a
screenshot, etc. — there is no way to make the QR itself single-use, so the claim
guard must live in verify-qr. The dashboard only *mirrors* this state (ready vs
claimed) for UX; it is not the enforcement point.

**How to apply:** when adding new surfaces that show this QR, do NOT add a second
allocation path. Derive claim state from the order: `paid && !ticket_code` = ready,
`queued|washing|done` = claimed (show the ticket), `pending_payment` = confirming,
`voided|refunded` = dead.

## payment_ref is intentionally customer-visible; successIndicator is NOT
`/api/customer/orders` returns `payment_ref` only for `qr_provider='pocket_pay'`
rows because the QR needs it. That is safe — `payment_ref` is just the order id the
customer already shows at the lane. The callback-auth secret is
`pocket_pay_success_indicator`; never expose that (see pocket-pay-callback-auth.md).
