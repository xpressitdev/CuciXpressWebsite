-- MDR / transaction fee rates (Merchant Discount Rate).
-- The merchant fee a payment provider charges the business per digital
-- transaction. Keyed by the SAME (payment_method, qr_provider) pair stored on
-- orders so reports can look up a transaction's rate. Kept separate from
-- payment_methods because the website gateway uses qr_provider='pocket_pay',
-- which the payment_methods CHECK constraint forbids.
-- mdr_bps = basis points (250 = 2.5%). Cash / bank transfer = 0.
-- Idempotent: safe to re-run (dev, staging, prod).

CREATE TABLE IF NOT EXISTS payment_fee_rates (
  id             text PRIMARY KEY,
  label          text NOT NULL,
  payment_method text NOT NULL,
  qr_provider    text,
  mdr_bps        integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Unique per (payment_method, qr_provider). NULL-safe via COALESCE because
-- Postgres treats NULL qr_provider rows as distinct in a plain unique index,
-- which would let duplicate (card, NULL) rows through.
-- (Hardened in 2026-06-07_05; kept here so a fresh DB builds it correctly.)
CREATE UNIQUE INDEX IF NOT EXISTS payment_fee_rates_method_provider_unique
  ON payment_fee_rates (payment_method, COALESCE(qr_provider, ''));

-- Seed the known rates. ON CONFLICT DO NOTHING so re-runs never clobber an
-- owner's later edits.
INSERT INTO payment_fee_rates (id, label, payment_method, qr_provider, mdr_bps) VALUES
  ('fee_card',          'Card',                      'card',    NULL,             270),
  ('fee_progresif',     'Progresif Ding!',           'qr_code', 'progresif_ding', 250),
  ('fee_pocket_qr',     'Pocket QR (counter)',       'qr_code', 'pocket_pay_qr',  300),
  ('fee_pocket_web',    'Pocket Website Gateway',    'qr_code', 'pocket_pay',     350)
ON CONFLICT (payment_method, COALESCE(qr_provider, '')) DO NOTHING;
