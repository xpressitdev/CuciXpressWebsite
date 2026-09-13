-- Add the server-recorded start time for an active wash.
-- Date: 2026-09-13
-- Reason: Public queue availability must distinguish an occupied wash lane
-- from an empty/open lane and must not restart the eight-minute estimate when
-- the same start request is retried.
--
-- Nullable is intentional. Rows that were already `washing` before this
-- migration have no trustworthy start instant; the application presents those
-- rows as "Washing — time unavailable" rather than inventing a historical
-- start time.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS washing_started_at TIMESTAMPTZ;