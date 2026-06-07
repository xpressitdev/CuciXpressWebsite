-- Make payment_fee_rates uniqueness NULL-safe.
-- Postgres treats NULL qr_provider rows as DISTINCT in a plain unique index,
-- so the original (payment_method, qr_provider) index let duplicate
-- (card, NULL) / (cash, NULL) rows through. Duplicates collapse in the
-- in-memory rate map (last-write-wins), making MDR fees nondeterministic.
-- Fix: dedupe any conflicting rows, then enforce uniqueness on
-- (payment_method, COALESCE(qr_provider, '')).
-- Idempotent: safe to re-run (dev, staging, prod).

-- 1) Dedupe: keep the lowest id per (payment_method, coalesce(qr_provider,'')).
DELETE FROM payment_fee_rates a
USING payment_fee_rates b
WHERE a.payment_method = b.payment_method
  AND COALESCE(a.qr_provider, '') = COALESCE(b.qr_provider, '')
  AND a.id > b.id;

-- 2) Replace the NULL-distinct index with a NULL-safe one.
DROP INDEX IF EXISTS payment_fee_rates_method_provider_unique;
CREATE UNIQUE INDEX IF NOT EXISTS payment_fee_rates_method_provider_unique
  ON payment_fee_rates (payment_method, COALESCE(qr_provider, ''));
