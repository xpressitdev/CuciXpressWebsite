-- ============================================================
-- Phase 1: POS customer + vehicle normalisation
--
-- Adds a phone-keyed `customers` table for walk-ins (no login),
-- extends the existing `cars` table to also hold orphan + walk-in
-- vehicles (relaxes NOT NULLs that block POS use), and links
-- `orders` to the vehicle that was washed.
--
-- Trunk-app data (LiveQue's 559 cars, 508 users) is unchanged.
-- Existing rows already have user_id, brand, model, type populated;
-- relaxing NOT NULL only affects rows inserted after this migration.
--
-- Production already has 17 duplicate-plate rows in `cars` (data
-- entry inconsistencies). We do NOT add a UNIQUE constraint on
-- license_plate — that's a separate cleanup. We add a non-unique
-- functional index for normalized lookup instead.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. customers — POS walk-ins (phone-keyed, optional FK to users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id          SERIAL PRIMARY KEY,
  phone       TEXT NOT NULL,
  name        TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique
  ON customers (phone);
CREATE INDEX IF NOT EXISTS customers_user_id_idx
  ON customers (user_id);

-- ------------------------------------------------------------
-- 2. cars — relax NOT NULLs + add POS-side columns
-- ------------------------------------------------------------
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='cars' AND column_name='user_id' AND is_nullable='NO') THEN
    ALTER TABLE cars ALTER COLUMN user_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='cars' AND column_name='brand' AND is_nullable='NO') THEN
    ALTER TABLE cars ALTER COLUMN brand DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='cars' AND column_name='model' AND is_nullable='NO') THEN
    ALTER TABLE cars ALTER COLUMN model DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='cars' AND column_name='type' AND is_nullable='NO') THEN
    ALTER TABLE cars ALTER COLUMN "type" DROP NOT NULL;
  END IF;
END
$mig$;

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS color         TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS cars_customer_id_idx ON cars (customer_id);
CREATE INDEX IF NOT EXISTS cars_user_id_idx     ON cars (user_id);

-- Functional index for normalized plate lookup (uppercase, no spaces).
-- NOT unique — production has duplicate plates we don't dedup here.
CREATE INDEX IF NOT EXISTS cars_plate_normalized_idx
  ON cars (UPPER(REGEXP_REPLACE(license_plate, '\s+', '', 'g')));

-- ------------------------------------------------------------
-- 3. orders.vehicle_id — link to the washed car
-- ------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES cars(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_vehicle_id_idx ON orders (vehicle_id);

-- ------------------------------------------------------------
-- 4. updated_at trigger for customers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_customers_updated_at() RETURNS trigger AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

COMMIT;
