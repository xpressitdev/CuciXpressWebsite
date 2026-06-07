-- 2026-06-07_01: Branch live availability status.
-- Lets cashiers/owner set a branch's live state beyond a binary open/closed:
--   status: 'open' | 'closed' | 'maintenance' | 'busy'
--   status_note: optional short customer-facing reason (e.g. "water supply
--                issue, back by 3pm").
-- is_open stays in sync (open/busy => true, closed/maintenance => false) so
-- existing code that reads is_open keeps working.
-- Idempotent: safe to re-run.

ALTER TABLE branches ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS status_note text;

-- Backfill status from the legacy is_open flag. The column is created with a
-- DEFAULT of 'open', so we only need to correct rows that are closed but still
-- show the default 'open'. Rows with an intentional status (closed/maintenance/
-- busy) set later by staff are left untouched.
UPDATE branches
   SET status = 'closed'
 WHERE is_open IS FALSE AND status = 'open';

-- Harden status to the known set at the DB layer (defense-in-depth against
-- out-of-band writes). Drop-then-add keeps this idempotent on re-run.
ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_status_check;
ALTER TABLE branches ADD CONSTRAINT branches_status_check
  CHECK (status IN ('open', 'closed', 'maintenance', 'busy'));
