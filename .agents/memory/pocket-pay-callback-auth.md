---
name: Pocket Pay callback authenticity
description: How the Pocket Pay payment callback is authenticated (no hash/signature) and the rule that the success_indicator must stay server-only.
---

Pocket Pay's callback body has NO signature/hash. The real shape is
`{ OrderId, Message, successIndicator }` (capital OrderId; success is signalled by
`Message`, e.g. "Successful Payment"). An earlier build checked a guessed MD5
"hash" field and read lowercase `order_id`, so EVERY callback 400'd and no order
or subscription ever finalized.

**Authenticity model:** Pocket Pay returns a per-order `successIndicator` token at
payment-create time and echoes it in the callback. We store it at checkout-start
(`subscriptions.pocket_pay_success_indicator` / `orders.pocket_pay_success_indicator`)
and the callback is only honoured when its `successIndicator` matches the stored
value for that order id.

**Why the token must stay server-only:** the create-time token is known before
payment. If a start response returns it to the browser, a caller can read it and
POST a forged "paid" callback without paying. So NEVER include success_indicator
in any start API response (subscription start or single-wash order_details) or in
client-facing logs. Pocket Pay re-exposing it in the post-payment redirect URL to
the paying user is harmless (they already paid).
**How to apply:** keep success_indicator out of all client payloads; store + match
it server-side only.

**Success detection:** match an EXACT allowlist of Message/status values
(`successful payment`/`success`/`completed`/`paid`), never substring — `includes('success')`
wrongly matches "unsuccessful".

**Legacy NULL-indicator rows:** rows predating the column can't authenticate.
Do NOT add a NULL fallback (reopens the forgery hole). Reconcile manually:
subscriptions via `activatePocketPaySubscription(orderId)` (idempotent), orders
only after confirming payment out-of-band.

**Note:** the prod fix only takes effect after redeploy — the deployed build runs
the old callback until then. The originally-stuck customer sub was fixed directly
in the DB.
