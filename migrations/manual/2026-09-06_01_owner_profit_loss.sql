-- 2026-09-06_01_owner_profit_loss.sql
-- Owner-only Profit & Loss: Connecteam expense snapshot metadata, allocations,
-- and monthly depreciation settings.  This migration intentionally stores only
-- the accounting fields needed for P&L/audit; it never stores receipts, bank
-- details, submitter names, or arbitrary form answers.
--
-- Idempotent and forward-only. Apply through the documented manual migration
-- procedure to development and staging first; never use drizzle-kit push.

CREATE TABLE IF NOT EXISTS connecteam_expense_sync_runs (
  id                   bigserial PRIMARY KEY,
  form_id              text NOT NULL,
  started_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,
  status               text NOT NULL DEFAULT 'running',
  submissions_seen     integer NOT NULL DEFAULT 0,
  error_code           text,
  CHECK (status IN ('running', 'succeeded', 'failed', 'incomplete'))
);
CREATE INDEX IF NOT EXISTS connecteam_expense_sync_runs_form_started_idx
  ON connecteam_expense_sync_runs(form_id, started_at DESC);

-- One compact state row per Connecteam form. error_code is an application
-- controlled, non-sensitive code (never the upstream response body).
CREATE TABLE IF NOT EXISTS connecteam_expense_sync_state (
  form_id                    text PRIMARY KEY,
  last_successful_run_id     bigint REFERENCES connecteam_expense_sync_runs(id),
  last_successful_at         timestamptz,
  last_attempt_at            timestamptz,
  last_attempt_status        text NOT NULL DEFAULT 'never',
  last_error_code            text,
  expected_submission_count  integer,
  lease_token                text,
  lease_expires_at           timestamptz,
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (last_attempt_status IN ('never', 'running', 'succeeded', 'failed', 'incomplete'))
);

-- Sanitised, read-only Connecteam expense projection. source_status remains
-- nullable because legacy/approved submissions may omit it. is_present is only
-- set false after a complete paginated snapshot succeeds, so an interrupted
-- sync cannot erase a valid local accounting record.
CREATE TABLE IF NOT EXISTS connecteam_expense_submissions (
  id                   bigserial PRIMARY KEY,
  form_id              text NOT NULL,
  submission_id        text NOT NULL,
  source_updated_at    timestamptz,
  expense_date         date,
  amount_cents         integer,
  currency             text NOT NULL DEFAULT 'BND',
  source_status        text,
  source_category      text,
  branch_choices       jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_eligible          boolean NOT NULL DEFAULT false,
  is_present           boolean NOT NULL DEFAULT true,
  last_seen_run_id     bigint REFERENCES connecteam_expense_sync_runs(id),
  content_hash         text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connecteam_expense_submissions_form_submission_uq
    UNIQUE (form_id, submission_id),
  CHECK (currency = 'BND'),
  CHECK (amount_cents IS NULL OR amount_cents >= 0),
  CHECK (jsonb_typeof(branch_choices) = 'array')
);
CREATE INDEX IF NOT EXISTS connecteam_expense_submissions_reporting_idx
  ON connecteam_expense_submissions(form_id, is_present, is_eligible, expense_date);
CREATE INDEX IF NOT EXISTS connecteam_expense_submissions_seen_run_idx
  ON connecteam_expense_submissions(last_seen_run_id);

-- A submission is transformed into allocation rows inside the same transaction
-- as its upsert. allocation_key supports the explicit unallocated/review row
-- without relying on PostgreSQL's NULL-distinct unique-index behaviour.
CREATE TABLE IF NOT EXISTS pnl_expense_allocations (
  id                              bigserial PRIMARY KEY,
  connecteam_expense_submission_id bigint NOT NULL
    REFERENCES connecteam_expense_submissions(id) ON DELETE CASCADE,
  allocation_key                  text NOT NULL,
  branch_id                       integer REFERENCES branches(id),
  pnl_category                    text,
  allocation_status               text NOT NULL,
  cents                           integer NOT NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pnl_expense_allocations_submission_key_uq
    UNIQUE (connecteam_expense_submission_id, allocation_key),
  CHECK (allocation_status IN ('allocated', 'unmapped_category', 'invalid_amount', 'invalid_date', 'invalid_branch', 'excluded_status')),
  CHECK (
    (allocation_status = 'allocated' AND branch_id IS NOT NULL AND pnl_category IS NOT NULL)
    OR (allocation_status = 'unmapped_category' AND branch_id IS NOT NULL AND pnl_category IS NULL)
    OR (allocation_status NOT IN ('allocated', 'unmapped_category') AND branch_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS pnl_expense_allocations_reporting_idx
  ON pnl_expense_allocations(branch_id, pnl_category);

-- Editable only through the owner P&L settings endpoint. Values are real
-- workbook values, not an open-ended depreciation assumption.
CREATE TABLE IF NOT EXISTS pnl_depreciation_settings (
  year                 integer NOT NULL,
  month                integer NOT NULL,
  branch_id            integer NOT NULL REFERENCES branches(id),
  cents                integer NOT NULL,
  updated_by_staff_id  text REFERENCES staff(id),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, month, branch_id),
  CHECK (year BETWEEN 2000 AND 2200),
  CHECK (month BETWEEN 1 AND 12),
  CHECK (cents >= 0)
);

-- The supplied Q2 workbook establishes BND 141.67 per branch for Jan-Jun
-- 2026 only. It intentionally has no Jul-Dec seed.
INSERT INTO pnl_depreciation_settings (year, month, branch_id, cents)
SELECT 2026, month_number, b.id, 14167
FROM generate_series(1, 6) AS month_number
CROSS JOIN branches AS b
WHERE lower(trim(b.name)) IN (
  'tungku', 'salar', 'bengkurong', 'tutong', 'lambak',
  'cuci xpress tungku', 'cuci xpress salar', 'cuci xpress bengkurong',
  'cuci xpress tutong', 'cuci xpress lambak'
)
ON CONFLICT (year, month, branch_id) DO NOTHING;