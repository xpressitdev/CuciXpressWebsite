---
name: Web checkout order insert is mandatory
description: Why the pending_payment insert in web checkout must never be best-effort
---
The pending_payment order insert during web checkout is MANDATORY, with retries; on failure the checkout must abort (503) instead of returning the payment link.

**Why:** July 21, 2026 incident — a transient DB failure during the insert was swallowed as "best effort", the customer still got the Pocket Pay link, paid B$12, and there was no order row to match the callback → "Payment Not Completed", no receipt/QR email, money only visible in the Pocket merchant portal. Deployment logs were also lossy (the error log line never appeared), so silent-continue paths can be invisible in production.

**How to apply:** any flow that hands a customer an external payment link must first durably record the local order it will be matched against. Never downgrade this to try/catch-and-continue. Pocket links generated before an aborted checkout are harmless — unpaid links expire.
