---
name: Pending payment auto-void
description: Why abandoned web checkouts disappear on their own, and where the reconciliation panel lives.
---

# Pending web payment auto-void + panel location

A background sweep auto-voids `orders` in `status='pending_payment'` AND `qr_provider='pocket_pay'` once older than **72 hours**. Runs on an interval from server startup alongside the other background workers.

**Why:** These rows are abandoned web Pocket Pay checkouts (customer opened checkout, payment never confirmed). They are the ONLY source of `pending_payment` — POS orders are created already paid/queued. Left alone they accumulate forever and pollute the reconciliation list and liability views. Auto-void is safe because `/api/payment-callback` only finalizes orders still in `pending_payment`; a (vanishingly rare) confirmation arriving after the 72h void is simply ignored, never double-charging. Voiding a pending order does NOT fire the SharePoint outbox trigger (that fires only on paid/queued/refunded), so no export row is produced and revenue reports are unaffected (voided is already excluded from real sales).

**How to apply:**
- If a customer reports a stuck pending web payment vanished, that's the 72h sweep, not a bug.
- Keep the `qr_provider='pocket_pay'` guard on both the sweep and the pending-payments list endpoint — if a future flow ever creates `pending_payment` with a different provider, it must NOT be swept without re-checking callback safety for that provider.
- The manual "pending web payments" reconciliation panel is a shared component rendered at the top of the admin **Dashboard** tab, gated to owner/manager (its endpoints require that role; the Dashboard tab itself is shown to all staff). It returns null when empty, so it only appears when there's something to act on.
