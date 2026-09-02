-- One Interior Refresh entitlement per explicitly covered car and paid cycle.
-- Idempotent and safe for legacy booked/used rows. Unresolvable legacy rows
-- remain vehicle-less (and therefore unbookable) rather than being misassigned.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE interior_refresh_entitlements
  ADD COLUMN IF NOT EXISTS vehicle_id integer REFERENCES cars(id);

-- Keep booking rows self-describing for the one-claim-per-period guard. These
-- columns may already exist when the duplicate-claim safeguard was installed.
ALTER TABLE interior_refresh_bookings
  ADD COLUMN IF NOT EXISTS benefit_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS benefit_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS claim_guard_exempt boolean NOT NULL DEFAULT false;
UPDATE interior_refresh_bookings b
SET benefit_period_start = e.period_start,
    benefit_period_end = e.period_end
FROM interior_refresh_entitlements e
WHERE e.id = b.entitlement_id
  AND (b.benefit_period_start IS NULL OR b.benefit_period_end IS NULL);
ALTER TABLE interior_refresh_bookings
  ALTER COLUMN benefit_period_start SET NOT NULL,
  ALTER COLUMN benefit_period_end SET NOT NULL;

-- A booking is the strongest evidence of which car owns a legacy entitlement.
-- Prefer a live/claimed booking over a cancelled booking, then the newest row.
UPDATE interior_refresh_entitlements e
SET vehicle_id = (
  SELECT b.vehicle_id
  FROM interior_refresh_bookings b
  WHERE b.entitlement_id = e.id
  ORDER BY
    CASE WHEN b.status IN ('booked','checked_in','completed','no_show') THEN 0 ELSE 1 END,
    b.created_at DESC,
    b.id DESC
  LIMIT 1
)
WHERE e.vehicle_id IS NULL
  AND EXISTS (
    SELECT 1 FROM interior_refresh_bookings b WHERE b.entitlement_id = e.id
  );

-- Assign an unbooked legacy entitlement to the first covered/enrolled car.
-- Plates are compared with the same uppercase/whitespace-free normalization
-- used by subscriptions and cars. Family is capped at three, Unlimited at one.
UPDATE interior_refresh_entitlements e
SET vehicle_id = (
  SELECT c.id AS vehicle_id
  FROM subscriptions s
  CROSS JOIN LATERAL unnest(string_to_array(COALESCE(s.car_plate, ''), ','))
    WITH ORDINALITY AS p(plate, ord)
  JOIN cars c
    ON UPPER(REGEXP_REPLACE(c.license_plate, '\s+', '', 'g'))
       = UPPER(REGEXP_REPLACE(p.plate, '\s+', '', 'g'))
   AND c.user_id = s.user_id
  WHERE s.id = e.subscription_id
    AND p.ord <= CASE WHEN s.plan_id = 'family' THEN 3 ELSE 1 END
    AND NULLIF(REGEXP_REPLACE(p.plate, '\s+', '', 'g'), '') IS NOT NULL
  ORDER BY p.ord, c.id
  LIMIT 1
)
WHERE e.vehicle_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM subscriptions s
    CROSS JOIN LATERAL unnest(string_to_array(COALESCE(s.car_plate, ''), ','))
      WITH ORDINALITY AS p(plate, ord)
    JOIN cars c
      ON UPPER(REGEXP_REPLACE(c.license_plate, '\s+', '', 'g'))
         = UPPER(REGEXP_REPLACE(p.plate, '\s+', '', 'g'))
     AND c.user_id = s.user_id
    WHERE s.id = e.subscription_id
      AND p.ord <= CASE WHEN s.plan_id = 'family' THEN 3 ELSE 1 END
      AND NULLIF(REGEXP_REPLACE(p.plate, '\s+', '', 'g'), '') IS NOT NULL
  );

DROP INDEX IF EXISTS interior_refresh_entitlements_invoice_uq;
DROP INDEX IF EXISTS interior_refresh_entitlements_period_uq;

CREATE UNIQUE INDEX IF NOT EXISTS interior_refresh_entitlements_invoice_vehicle_uq
  ON interior_refresh_entitlements(invoice_id, vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS interior_refresh_entitlements_period_vehicle_uq
  ON interior_refresh_entitlements(subscription_id, period_start, period_end, vehicle_id);

ALTER TABLE interior_refresh_bookings
  DROP CONSTRAINT IF EXISTS interior_refresh_one_claim_per_billing_period;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interior_refresh_one_claim_per_vehicle_billing_period'
  ) THEN
    ALTER TABLE interior_refresh_bookings
      ADD CONSTRAINT interior_refresh_one_claim_per_vehicle_billing_period
      EXCLUDE USING gist (
        subscription_id WITH =,
        vehicle_id WITH =,
        tstzrange(benefit_period_start, benefit_period_end, '[)') WITH &&
      )
      WHERE (
        claim_guard_exempt = false
        AND status IN ('booked', 'checked_in', 'completed', 'no_show')
      );
  END IF;
END $$;

-- The original duplicate-claim guard protected one claim per subscription
-- period. Family now needs that same protection scoped to each covered car.
CREATE OR REPLACE FUNCTION enforce_interior_refresh_billing_period_claim()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.claim_guard_exempt = false
    AND NEW.status IN ('booked', 'checked_in', 'completed', 'no_show')
    AND EXISTS (
      SELECT 1
      FROM interior_refresh_bookings existing
      WHERE existing.id <> NEW.id
        AND existing.subscription_id = NEW.subscription_id
        AND existing.vehicle_id = NEW.vehicle_id
        AND existing.status IN ('booked', 'checked_in', 'completed', 'no_show')
        AND tstzrange(existing.benefit_period_start, existing.benefit_period_end, '[)')
          && tstzrange(NEW.benefit_period_start, NEW.benefit_period_end, '[)')
    )
  THEN
    RAISE EXCEPTION 'vehicle billing period already has an Interior Refresh claim'
      USING ERRCODE = '23P01',
        CONSTRAINT = 'interior_refresh_one_claim_per_vehicle_billing_period';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS interior_refresh_billing_period_claim_guard
  ON interior_refresh_bookings;
CREATE TRIGGER interior_refresh_billing_period_claim_guard
BEFORE INSERT OR UPDATE OF subscription_id, vehicle_id, benefit_period_start,
  benefit_period_end, status, claim_guard_exempt
ON interior_refresh_bookings
FOR EACH ROW EXECUTE FUNCTION enforce_interior_refresh_billing_period_claim();

CREATE OR REPLACE FUNCTION create_interior_refresh_entitlement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'paid'
     AND NEW.period_start IS NOT NULL
     AND NEW.period_end IS NOT NULL THEN
    INSERT INTO interior_refresh_entitlements
      (id, subscription_id, invoice_id, vehicle_id, period_start, period_end)
    SELECT
      'ire_' || md5(NEW.id || ':' || covered.vehicle_id::text),
      NEW.subscription_id,
      NEW.id,
      covered.vehicle_id,
      NEW.period_start,
      NEW.period_end
    FROM (
      SELECT DISTINCT c.id AS vehicle_id
      FROM subscriptions s
      CROSS JOIN LATERAL unnest(string_to_array(COALESCE(s.car_plate, ''), ','))
        WITH ORDINALITY AS p(plate, ord)
      JOIN cars c
        ON UPPER(REGEXP_REPLACE(c.license_plate, '\s+', '', 'g'))
           = UPPER(REGEXP_REPLACE(p.plate, '\s+', '', 'g'))
       AND c.user_id = s.user_id
      WHERE s.id = NEW.subscription_id
        AND s.plan_id IN ('unlimited', 'family')
        AND COALESCE(s.is_test, false) = false
        AND p.ord <= CASE WHEN s.plan_id = 'family' THEN 3 ELSE 1 END
        AND NULLIF(REGEXP_REPLACE(p.plate, '\s+', '', 'g'), '') IS NOT NULL
    ) covered
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS subscription_invoice_interior_refresh_entitlement
  ON subscription_invoices;
CREATE TRIGGER subscription_invoice_interior_refresh_entitlement
AFTER INSERT OR UPDATE OF status, period_start, period_end
ON subscription_invoices
FOR EACH ROW EXECUTE FUNCTION create_interior_refresh_entitlement();

-- Backfill every paid current or historical invoice. The two per-vehicle unique
-- indexes prevent both invoice retries and duplicate invoices for one cycle
-- from producing another claim.
INSERT INTO interior_refresh_entitlements
  (id, subscription_id, invoice_id, vehicle_id, period_start, period_end)
SELECT
  'ire_' || md5(i.id || ':' || covered.vehicle_id::text),
  i.subscription_id,
  i.id,
  covered.vehicle_id,
  i.period_start,
  i.period_end
FROM subscription_invoices i
JOIN subscriptions s ON s.id = i.subscription_id
CROSS JOIN LATERAL (
  SELECT DISTINCT c.id AS vehicle_id
  FROM unnest(string_to_array(COALESCE(s.car_plate, ''), ','))
    WITH ORDINALITY AS p(plate, ord)
  JOIN cars c
    ON UPPER(REGEXP_REPLACE(c.license_plate, '\s+', '', 'g'))
       = UPPER(REGEXP_REPLACE(p.plate, '\s+', '', 'g'))
   AND c.user_id = s.user_id
  WHERE p.ord <= CASE WHEN s.plan_id = 'family' THEN 3 ELSE 1 END
    AND NULLIF(REGEXP_REPLACE(p.plate, '\s+', '', 'g'), '') IS NOT NULL
) covered
WHERE i.status = 'paid'
  AND i.period_start IS NOT NULL
  AND i.period_end IS NOT NULL
  AND s.plan_id IN ('unlimited', 'family')
  AND COALESCE(s.is_test, false) = false
ON CONFLICT DO NOTHING;

COMMIT;
