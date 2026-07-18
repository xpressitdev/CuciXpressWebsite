-- Counter-sold subscription passes need a durable marker so revenue
-- recognition doesn't depend on package_name text matching.
-- Idempotent; apply to BOTH $DATABASE_URL and $STAGING_DATABASE_URL.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type text;

-- Backfill any existing counter-pass orders (identified by the legacy
-- string predicate used before this column existed).
UPDATE orders
   SET order_type = 'counter_subscription'
 WHERE order_type IS NULL
   AND package_id IS NULL
   AND package_name LIKE '%Monthly Pass%';
