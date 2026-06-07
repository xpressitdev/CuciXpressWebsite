-- Allow multiple config rows for the same underlying payment method when the
-- labels differ — e.g. "Bank Transfer BIBD" and "Bank Transfer Baiduri" both
-- map to method='bank_transfer' but represent different bank accounts.
--
-- Previously uniqueness was (method, COALESCE(qr_provider,'')), which capped
-- non-QR methods (cash, bank_transfer, card, …) at exactly one row each.
-- We now key on label too, so distinct labels are allowed while exact
-- duplicates (same method + provider + label) are still blocked.
--
-- Idempotent: drop the old index, (re)create the wider one.

DROP INDEX IF EXISTS payment_methods_method_provider_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_method_provider_label_uniq
  ON payment_methods (method, COALESCE(qr_provider, ''), label);
