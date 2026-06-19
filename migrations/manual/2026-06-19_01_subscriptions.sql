-- 2026-06-19_01_subscriptions.sql
-- Auto-renewing web subscriptions billed via CyberSource Unified Checkout.
-- A paid subscription maintains an `unlimited` membership so the existing
-- lane-scan / QR redemption flow is unchanged.
-- Idempotent: safe to re-run on dev, staging, and prod.

-- 1. Allow web/online memberships that aren't tied to a POS staff/branch.
--    (POS inserts still always supply both; these only relax the constraint.)
ALTER TABLE memberships ALTER COLUMN sold_by_staff_id  DROP NOT NULL;
ALTER TABLE memberships ALTER COLUMN sold_at_branch_id DROP NOT NULL;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pos';

-- 2. Subscriptions (card-on-file, recurring monthly).
CREATE TABLE IF NOT EXISTS subscriptions (
  id                         text PRIMARY KEY,
  user_id                    integer REFERENCES users(id),
  customer_id                integer REFERENCES customers(id),
  plan_id                    text NOT NULL,                       -- 'unlimited' | 'family'
  status                     text NOT NULL DEFAULT 'active',      -- active | past_due | cancelled | incomplete
  price_cents                integer NOT NULL,
  currency                   text NOT NULL DEFAULT 'BND',
  cybersource_customer_id    text,                                -- TMS customer token
  cybersource_instrument_id  text,                                -- TMS payment instrument (charge target)
  card_brand                 text,
  card_last4                 text,
  current_period_start       timestamptz NOT NULL DEFAULT now(),
  current_period_end         timestamptz NOT NULL,
  next_billing_at            timestamptz NOT NULL,
  cancel_at_period_end       boolean NOT NULL DEFAULT false,
  failed_attempts            integer NOT NULL DEFAULT 0,
  membership_id              text REFERENCES memberships(id),     -- the unlimited membership it maintains
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
-- Original (customer-initiated) transaction id, used as previousTransactionId
-- for compliant stored-credential merchant-initiated renewals.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS initial_transaction_id text;
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_due_idx  ON subscriptions(status, next_billing_at);
-- At most ONE live subscription per user. A confirm claims an 'incomplete' row
-- BEFORE charging; a concurrent/duplicate confirm hits this and is rejected
-- with no second charge. 'incomplete' is included so an in-flight checkout is
-- exclusive too.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_user
  ON subscriptions(user_id)
  WHERE status IN ('active','past_due','incomplete');

-- 3. One row per billing attempt (audit + idempotency).
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id                     text PRIMARY KEY,
  subscription_id        text NOT NULL REFERENCES subscriptions(id),
  amount_cents           integer NOT NULL,
  currency               text NOT NULL DEFAULT 'BND',
  status                 text NOT NULL,                           -- paid | failed
  cybersource_payment_id text,
  period_start           timestamptz,
  period_end             timestamptz,
  error_message          text,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_invoices_sub_idx ON subscription_invoices(subscription_id);
-- Idempotency anchor for the renewal worker: at most one live (pending|paid)
-- invoice per subscription per billing period. The worker inserts a 'pending'
-- invoice BEFORE charging; if a prior pass already charged (or is mid-charge)
-- this exact period, the insert fails and the worker skips instead of
-- double-charging. A definitive decline flips the row to 'failed', freeing the
-- anchor so dunning can retry the same period.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_period_uq
  ON subscription_invoices(subscription_id, period_end)
  WHERE status IN ('pending','paid') AND period_end IS NOT NULL;
