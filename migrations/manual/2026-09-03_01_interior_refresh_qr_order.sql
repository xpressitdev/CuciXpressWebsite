-- One queue/POS order is permitted for each Interior Refresh appointment.
-- The endpoint also locks the booking before inserting; this index is the
-- persistent final guard for retries or future callers.
CREATE UNIQUE INDEX IF NOT EXISTS orders_interior_refresh_payment_ref_uq
  ON orders(payment_ref)
  WHERE qr_provider = 'interior_refresh';