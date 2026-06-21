---
name: Pocket Pay deeplink callback has no success message
description: Why web-prepaid Pocket Pay payments must not be confirmed by callback Message text
---

# Pocket Pay callback: trust the indicator, not the Message

Pocket Pay sends the payment confirmation callback differently depending on how
the customer finished paying (the portal's "Source" column):
- **web** (finished on Pocket's web gateway) → callback includes
  `Message: "Successful Payment"`.
- **deeplink** (customer's phone had the Pocket app, so the payment link opened
  the app and they confirmed in-app) → callback arrives with **`Message: null`**
  but still carries a valid per-order `successIndicator`.

So confirming success by matching the Message text wrongly **voided** genuinely
paid deeplink orders — the customer paid (verified in the Pocket merchant app)
but no wash QR/ticket was issued.

**Rule:** an *authenticated* callback (its `successIndicator` matches the
per-order secret we stored at create time) IS the success signal. Treat it as
paid unless it carries an EXPLICIT failure message. Do not require any success
text.

**Why:** Pocket only echoes the per-order `successIndicator` on a genuine
successful payment; that same secret is what authenticates the callback. The
Message field is informational and is empty in the in-app/deeplink flow.

**How to apply:** lives in the `/api/payment-callback` handler. The in-store POS
QR verify flow is different — it gets a *synchronous* status response with a real
Message, so its message-based success parsing is fine and was left unchanged.

**Side effects unlocked once deeplink orders correctly become `paid`:** the
receipt+QR email sends, the wash QR appears in the customer dashboard Activity
tab (status `paid` + no ticket = "ready"), and after staff scan it flips to
"claimed" (verify-qr also blocks re-scan server-side) — no extra code needed.

**Watch out:** the callback UPDATE only flips rows still at
`status='pending_payment'`, so an order wrongly voided by an earlier bad callback
will NOT auto-recover — it needs manual/scripted reconciliation.

## Reconciling stuck/voided orders against Pocket (the truth source)

You do NOT need the Pocket merchant portal — query Pocket's own status API per
order. The authoritative call (read-only):
- `POST https://pocket-pay.threeg.asia/payments/status`
- body `{ api_key, salt, order_id }` where `order_id` = our `orders.payment_ref`.
  Auth is api_key+salt in the body (same as every other Pocket call) — NOT a
  separate md5 hash.
- response: `{ method, status_id, final_amount, order_ref }`. **`status_id: 1` =
  PAID, `status_id: 0` = NOT paid.** Cross-check `final_amount` against
  `total_cents/100`.

**Gotcha:** the in-code helper `queryTransactionStatus()` in `server/payment.ts`
is broken — it posts to the TEST url with the wrong shape `{api_key,order_id,hash}`
and gets `"Insufficient information POSTed."`. Use the body shape above instead.

Candidate stuck rows to check: `status IN ('voided','pending_payment') AND
qr_provider='pocket_pay'`. A `voided` pocket_pay row almost always WAS paid (the
callback only voids after the successIndicator authenticated); `pending_payment`
rows are a genuine mix — check each `payment_ref` individually (same plate can
have one paid attempt and one abandoned). Recover a confirmed-paid order the same
way as a normal completed wash (status `done` if already washed, or `paid` if the
customer still needs to claim the wash QR); the +1 loyalty stamp auto-counts when
`package_id='pkg_basic_tyre_wax'`.
