-- Task #34. Idempotent; does not change subscription billing indexes/behaviour.
BEGIN;
CREATE TABLE IF NOT EXISTS interior_refresh_promotion (
 id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true, starts_on date, ends_on date,
 branch_id integer REFERENCES branches(id), duration_minutes integer NOT NULL DEFAULT 45 CHECK(duration_minutes=45),
 capacity integer NOT NULL DEFAULT 1 CHECK(capacity=1), opens_at text NOT NULL DEFAULT '08:00' CHECK(opens_at='08:00'),
 final_start_at text NOT NULL DEFAULT '18:15' CHECK(final_start_at='18:15'),
 updated_by_staff_id text REFERENCES staff(id), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>=starts_on));
INSERT INTO interior_refresh_promotion(id,enabled,branch_id)
 SELECT 'subscriber-interior-refresh',true,id FROM branches WHERE name ILIKE '%tungku%' ORDER BY id LIMIT 1
 ON CONFLICT(id) DO NOTHING;
INSERT INTO interior_refresh_promotion(id,enabled) VALUES('subscriber-interior-refresh',true) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS interior_refresh_entitlements (
 id text PRIMARY KEY, subscription_id text NOT NULL REFERENCES subscriptions(id),
 invoice_id text NOT NULL REFERENCES subscription_invoices(id), period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL, status text NOT NULL DEFAULT 'available' CHECK(status IN('available','booked','used')),
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK(period_end>period_start),
 CHECK((status='used')=(consumed_at IS NOT NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS interior_refresh_entitlements_invoice_uq ON interior_refresh_entitlements(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS interior_refresh_entitlements_period_uq ON interior_refresh_entitlements(subscription_id,period_start,period_end);

CREATE TABLE IF NOT EXISTS interior_refresh_bookings (
 id text PRIMARY KEY, entitlement_id text NOT NULL REFERENCES interior_refresh_entitlements(id),
 subscription_id text NOT NULL REFERENCES subscriptions(id), vehicle_id integer NOT NULL REFERENCES cars(id),
 branch_id integer NOT NULL REFERENCES branches(id), slot_start timestamptz NOT NULL, slot_end timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'booked' CHECK(status IN('booked','checked_in','completed','cancelled','no_show')),
 booked_by_user_id integer NOT NULL REFERENCES users(id), cancelled_at timestamptz, checked_in_at timestamptz,
 completed_at timestamptz, no_show_at timestamptz, updated_by_staff_id text REFERENCES staff(id),
 service_history_id integer REFERENCES service_history(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), CHECK(slot_end=slot_start+interval '45 minutes'));
CREATE INDEX IF NOT EXISTS interior_refresh_bookings_schedule_idx ON interior_refresh_bookings(branch_id,slot_start);
CREATE UNIQUE INDEX IF NOT EXISTS interior_refresh_one_live_booking_per_entitlement ON interior_refresh_bookings(entitlement_id) WHERE status IN('booked','checked_in','completed','no_show');
CREATE UNIQUE INDEX IF NOT EXISTS interior_refresh_one_exact_live_slot ON interior_refresh_bookings(branch_id,slot_start) WHERE status IN('booked','checked_in');
-- Range-only GiST needs no btree_gist. This is the final database authority
-- against any overlapping live appointments, including different start times.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='interior_refresh_no_live_overlap') THEN
  ALTER TABLE interior_refresh_bookings ADD CONSTRAINT interior_refresh_no_live_overlap
   EXCLUDE USING gist (tstzrange(slot_start,slot_end,'[)') WITH &&)
   WHERE (status IN ('booked','checked_in'));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION create_interior_refresh_entitlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='paid' AND NEW.period_start IS NOT NULL AND NEW.period_end IS NOT NULL THEN
  INSERT INTO interior_refresh_entitlements(id,subscription_id,invoice_id,period_start,period_end)
  SELECT 'ire_'||md5(NEW.id),NEW.subscription_id,NEW.id,NEW.period_start,NEW.period_end FROM subscriptions s
   WHERE s.id=NEW.subscription_id AND s.plan_id IN('unlimited','family') AND COALESCE(s.is_test,false)=false
  ON CONFLICT DO NOTHING;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS subscription_invoice_interior_refresh_entitlement ON subscription_invoices;
CREATE TRIGGER subscription_invoice_interior_refresh_entitlement AFTER INSERT OR UPDATE OF status,period_start,period_end ON subscription_invoices FOR EACH ROW EXECUTE FUNCTION create_interior_refresh_entitlement();
INSERT INTO interior_refresh_entitlements(id,subscription_id,invoice_id,period_start,period_end)
 SELECT 'ire_'||md5(i.id),i.subscription_id,i.id,i.period_start,i.period_end FROM subscription_invoices i JOIN subscriptions s ON s.id=i.subscription_id
 WHERE i.status='paid' AND i.period_start IS NOT NULL AND i.period_end IS NOT NULL AND s.plan_id IN('unlimited','family') AND COALESCE(s.is_test,false)=false ON CONFLICT DO NOTHING;
COMMIT;