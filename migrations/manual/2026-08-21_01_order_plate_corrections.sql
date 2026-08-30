-- Manager-only order plate correction audit and safe orphan-car cleanup helper.
BEGIN;

CREATE TABLE IF NOT EXISTS order_plate_corrections (
  id                       bigserial PRIMARY KEY,
  -- Deliberately snapshot ids rather than FKs: audit must survive later
  -- operational retention/deletion of the referenced row.
  order_id                 text NOT NULL,
  old_plate                text NOT NULL,
  new_plate                text NOT NULL,
  old_vehicle_id           integer,
  new_vehicle_id           integer NOT NULL,
  old_order_customer_id    integer,
  new_order_customer_id    integer,
  old_vehicle_user_id      integer,
  new_vehicle_user_id      integer,
  old_vehicle_customer_id  integer,
  new_vehicle_customer_id  integer,
  corrected_by_staff_id    text NOT NULL,
  reason                   text NOT NULL,
  corrected_at             timestamptz NOT NULL DEFAULT now(),
  old_car_deleted          boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS order_plate_corrections_corrected_at_idx
  ON order_plate_corrections (corrected_at DESC);
ALTER TABLE order_plate_corrections
  DROP CONSTRAINT IF EXISTS order_plate_corrections_order_id_key;
CREATE INDEX IF NOT EXISTS order_plate_corrections_order_id_idx
  ON order_plate_corrections (order_id, corrected_at DESC);

-- Audit rows are append-only, including for privileged SQL users.
CREATE OR REPLACE FUNCTION reject_order_plate_correction_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_plate_corrections is immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS order_plate_corrections_immutable
  ON order_plate_corrections;
CREATE TRIGGER order_plate_corrections_immutable
BEFORE UPDATE OR DELETE ON order_plate_corrections
FOR EACH ROW EXECUTE FUNCTION reject_order_plate_correction_mutation();

-- Checks every current/future FK to cars(id), not merely the tables known when
-- this migration was written. This prevents typo cleanup from erasing history
-- when another reference table is added later.
CREATE OR REPLACE FUNCTION car_has_references(p_car_id integer)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  ref record;
  found boolean;
BEGIN
  FOR ref IN
    SELECT con.conrelid::regclass AS table_name, att.attname AS column_name
      FROM pg_constraint con
      JOIN LATERAL unnest(con.conkey) AS key(attnum) ON true
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = key.attnum
     WHERE con.contype = 'f'
       AND con.confrelid = 'cars'::regclass
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
      ref.table_name, ref.column_name
    ) INTO found USING p_car_id;
    IF found THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$$;

COMMIT;