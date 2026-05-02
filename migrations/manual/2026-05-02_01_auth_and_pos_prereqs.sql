-- ============================================================
-- Migration: auth_and_pos_prereqs
-- Date: 2026-05-02
-- Author: agent + planning session
-- Reason: Land all tables required for (a) Lucia v3 auth (Task 1.3) and
--         (b) the POS surface (Month 2-5 per MASTER_PLAN) in a single
--         migration so we do not need to re-migrate when POS work begins.
--
-- Idempotent: every statement uses IF NOT EXISTS or a guarded DO block.
-- Forward-only: no DOWN section. To undo, write a new migration.
-- Touches: 8 new tables. ZERO changes to the existing 9 tables.
--
-- Tables added:
--   1. staff             — POS / CRM operators
--   2. auth_sessions     — Lucia v3 sessions (separate from legacy 'session'
--                          table owned by connect-pg-simple in LiveQue)
--   3. otp_codes         — WhatsApp / email one-time codes
--   4. audit_log         — security and admin action log
--   5. lanes             — physical wash lanes per branch
--   6. addons_catalog    — POS upsells (tire shine, fragrance, etc)
--   7. orders            — POS transactions (replaces / parallels
--                          service_history during cutover)
--   8. subscriptions     — customer membership state
--
-- Foreign-key types: branches.id and users.id are INTEGER serial in the
-- existing DB (verified in docs/SCHEMA_VERIFICATION.md). FKs into them
-- are INTEGER. New tables use TEXT PKs (nanoid-style) for distributed
-- ID generation and to avoid leaking row counts in URLs.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. staff
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
  id              text PRIMARY KEY,
  email           text NOT NULL UNIQUE,
  name            text NOT NULL,
  role            text NOT NULL CHECK (role IN ('owner', 'manager', 'lane', 'cashier')),
  branch_id       integer REFERENCES branches(id),
  password_hash   text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_branch_id_idx ON staff(branch_id);

-- ------------------------------------------------------------
-- 2. auth_sessions   (Lucia v3)
-- NOTE: Distinct from the legacy 'session' table managed by
-- connect-pg-simple in LiveQue. Do not unify.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_sessions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  user_type   text NOT NULL CHECK (user_type IN ('customer', 'staff')),
  expires_at  timestamptz NOT NULL,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
  ON auth_sessions(user_id, user_type);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx
  ON auth_sessions(expires_at);

-- ------------------------------------------------------------
-- 3. otp_codes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id           text PRIMARY KEY,
  identifier   text NOT NULL,                              -- phone or email
  code_hash    text NOT NULL,                              -- never store plaintext OTP
  purpose      text NOT NULL CHECK (purpose IN ('login', 'verify_phone', 'verify_email')),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  attempts     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_identifier_purpose_idx
  ON otp_codes(identifier, purpose);
CREATE INDEX IF NOT EXISTS otp_codes_expires_idx
  ON otp_codes(expires_at);

-- ------------------------------------------------------------
-- 4. audit_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  actor_id      text,                                       -- user id or staff id
  actor_type    text,                                       -- 'customer' | 'staff' | 'system'
  action        text NOT NULL,                              -- e.g. 'order.create', 'staff.role.change'
  entity_type   text,
  entity_id     text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_recent_idx
  ON audit_log(actor_id, created_at DESC);

-- ------------------------------------------------------------
-- 5. lanes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lanes (
  id          text PRIMARY KEY,
  branch_id   integer NOT NULL REFERENCES branches(id),
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS lanes_branch_id_idx ON lanes(branch_id);

-- ------------------------------------------------------------
-- 6. addons_catalog
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS addons_catalog (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  price_cents  integer NOT NULL CHECK (price_cents >= 0),
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true
);

-- ------------------------------------------------------------
-- 7. orders
--   payment_method: 'cash' | 'card' | 'qr' | 'subscription' | 'voucher'
--   status:         'paid' | 'queued' | 'washing' | 'done' | 'voided'
--   addons:         jsonb array of { id, name, price_cents } snapshots
-- ------------------------------------------------------------
-- Note on ticket_day: stored as a separate plain `date` column (defaulting to
-- the UTC date at insert time) rather than computed in the index expression.
-- Postgres rejects expression indexes built on STABLE functions like
-- `date(timestamptz)` ("functions in index expression must be marked
-- IMMUTABLE"), so we materialise the bucket key in its own column. The app
-- can also override `ticket_day` to use the branch's local timezone if/when
-- multi-timezone support lands.
CREATE TABLE IF NOT EXISTS orders (
  id                   text PRIMARY KEY,
  branch_id            integer NOT NULL REFERENCES branches(id),
  lane_id              text REFERENCES lanes(id),
  customer_id          integer REFERENCES users(id),
  staff_id             text REFERENCES staff(id),
  plate                text NOT NULL,
  package_id           text,
  package_name         text NOT NULL,
  package_price_cents  integer NOT NULL CHECK (package_price_cents >= 0),
  addons               jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_cents       integer NOT NULL CHECK (subtotal_cents >= 0),
  total_cents          integer NOT NULL CHECK (total_cents >= 0),
  payment_method       text NOT NULL CHECK (payment_method IN ('cash', 'card', 'qr', 'subscription', 'voucher')),
  payment_ref          text,
  ticket_code          text NOT NULL,
  ticket_day           date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  status               text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'queued', 'washing', 'done', 'voided')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS orders_branch_recent_idx
  ON orders(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_idx
  ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx
  ON orders(status);
CREATE INDEX IF NOT EXISTS orders_plate_idx
  ON orders(plate);

-- Per-branch daily ticket-code uniqueness (e.g. branch 1 issues A30 once per day)
CREATE UNIQUE INDEX IF NOT EXISTS orders_branch_ticket_day_uniq
  ON orders(branch_id, ticket_code, ticket_day);

-- ------------------------------------------------------------
-- 8. subscriptions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id                         text PRIMARY KEY,
  customer_id                integer NOT NULL REFERENCES users(id),
  tier                       text NOT NULL CHECK (tier IN ('unlimited', 'family', 'corporate')),
  price_cents                integer NOT NULL CHECK (price_cents >= 0),
  status                     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  current_period_start       timestamptz NOT NULL DEFAULT now(),
  current_period_end         timestamptz NOT NULL,
  washes_used_this_cycle     integer NOT NULL DEFAULT 0,
  cancelled_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_customer_status_idx
  ON subscriptions(customer_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx
  ON subscriptions(current_period_end);

COMMIT;

-- ============================================================
-- Verification queries (run manually after applying):
--
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public';
--   -- expected: 17 (was 9 before this migration)
--
--   \dt
--   -- expected to list all 8 new tables alongside the existing 9
--
--   SELECT count(*) FROM users;     -- expected: 508 (unchanged)
--   SELECT count(*) FROM cars;      -- expected: 559 (unchanged)
--   SELECT count(*) FROM branches;  -- expected: 5   (unchanged)
-- ============================================================
