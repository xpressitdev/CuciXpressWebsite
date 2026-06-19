---
name: Subscription billing idempotency
description: Two partial unique indexes are the only thing preventing CyberSource subscription double-charges — never drop them.
---

# Subscription billing double-charge protection

CyberSource auto-renewing subscriptions (server/subscriptions.ts) rely on TWO
partial unique indexes (migrations/manual/2026-06-19_01_subscriptions.sql) to
guarantee "charge at most once". They are load-bearing — do not remove or weaken
them when refactoring.

1. `subscriptions_one_live_per_user` — UNIQUE(user_id) WHERE status IN
   ('active','past_due','incomplete'). The confirm route inserts an
   `incomplete` row BEFORE charging; a concurrent/duplicate confirm trips this
   index and returns 409 with NO second charge. Stale `incomplete` rows (>15m)
   are deleted at the start of confirm so an abandoned checkout doesn't lock the
   user out.

2. `subscription_invoices_period_uq` — UNIQUE(subscription_id, period_end) WHERE
   status IN ('pending','paid'). The renewal worker inserts a `pending` invoice
   BEFORE charging; if a prior pass already charged-then-crashed for that exact
   period, the insert fails and the worker SKIPS instead of recharging.

**Why:** the external charge happens outside any DB transaction, so a crash
between "charge succeeded" and "DB advanced" would otherwise re-charge on the
next pass. The DB row claimed before the charge is the only crash-safe guard.

**How to apply:**
- Renewal periods MUST stay contiguous and derived from the row
  (periodStart = current_period_end, periodEnd = +1 month), NOT from now(), or
  the period_end anchor changes between retries and stops being idempotent.
- Definitive decline -> flip invoice to `failed` (frees the anchor for a dunning
  retry of the same period). Ambiguous error (network mid-charge) -> LEAVE it
  `pending` so the anchor blocks auto-retry; it needs manual reconciliation.
- A successful charge with no stored instrument is treated as a FAILED confirm
  (no active sub) because auto-renew is impossible without the card token; the
  charge is logged loudly for manual refund/reconciliation.
