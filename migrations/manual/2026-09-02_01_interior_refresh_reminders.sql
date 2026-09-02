-- Opt-in email reminders for Interior Refresh appointments.
BEGIN;
ALTER TABLE interior_refresh_bookings
  ADD COLUMN IF NOT EXISTS reminder_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE interior_refresh_bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS interior_refresh_reminders_due_idx
  ON interior_refresh_bookings(slot_start)
  WHERE status = 'booked' AND reminder_opt_in = true AND reminder_sent_at IS NULL;
COMMIT;