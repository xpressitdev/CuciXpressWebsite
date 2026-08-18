-- Restrict a cashier discount to one specific package (NULL = any package).
-- First use: the BruHealth $2 Off promo may only apply to the B$12 Full Package.
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS only_package_id text;

UPDATE discounts
   SET only_package_id = 'pkg_basic_tyre_wax'
 WHERE id = 'disc_bruhealth_2off';
