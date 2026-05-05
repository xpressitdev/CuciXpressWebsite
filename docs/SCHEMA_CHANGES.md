How to change the database schema
Last updated: 2026-05-02
Companion to: MIGRATION_NOTES.md (the why); this is the how.

When you need this document
You need this when you want to:

Add a new table
Add a column to an existing table
Add an index, constraint, or foreign key
Drop or rename anything (rare, requires extra care)
Change a column's type or default


What you'll do, in plain English
For every schema change, you do two things in lockstep:

Update the TypeScript schema (shared/schema.ts) so app code can use the new structure
Apply the matching SQL change to the production database

Both must be deployed together. The order matters: usually SQL first (database), then TypeScript (app code), so that the app doesn't reference columns that don't exist yet.

The procedure
Step 1 — Plan the change in plain English first
Before writing any code, write 1-2 sentences in plain English:

"Add a subscriptions table to track customer membership plans. Each subscription belongs to a user, has a plan_id, status, and expiry date."

If you can't explain the change in plain English, don't write SQL for it yet.
Step 2 — Write the SQL file
Create a new file under migrations/manual/ named with today's date and a short description:
migrations/manual/2026-05-15_add_subscriptions_table.sql
The SQL should be conservative and reversible-where-possible:
sql-- Add subscriptions table for membership tracking
-- Date: 2026-05-15
-- Reason: Launching membership program (see DECISIONS/008)

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx 
  ON subscriptions(user_id);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx 
  ON subscriptions(status);
Always use IF NOT EXISTS for CREATE TABLE and CREATE INDEX. This makes the SQL idempotent — running it twice is safe.
For column additions, use ADD COLUMN IF NOT EXISTS:
sqlALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
Step 3 — Test on a backup
Before touching production, restore a recent backup to a test database:
bash# Provision a temporary database (e.g., a separate Neon branch, or local Postgres)
# Restore the backup
psql $TEST_DATABASE_URL < backup_pre_week1.sql

# Apply your migration
psql $TEST_DATABASE_URL -f migrations/manual/2026-05-15_add_subscriptions_table.sql

# Verify the change
psql $TEST_DATABASE_URL -c "\d subscriptions"
If anything fails, fix the SQL and try again. Never debug SQL on production.
Step 4 — Take a fresh production backup
Right before applying to production:
bashpg_dump $DATABASE_URL --file=backup_before_$(date +%Y%m%d_%H%M)_$(echo "subscriptions_table" | head -c 30).sql
ls -lh backup_before_*.sql
Download to your laptop. This is your rollback point.
Step 5 — Apply to production
bashpsql $DATABASE_URL -f migrations/manual/2026-05-15_add_subscriptions_table.sql
Watch the output. Each statement should report something like CREATE TABLE or CREATE INDEX. No errors expected.
Step 6 — Verify
bashpsql $DATABASE_URL -c "\dt"
psql $DATABASE_URL -c "\d subscriptions"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
The new table should exist. Existing user count should be unchanged.
Step 7 — Update shared/schema.ts
Add the matching Drizzle TypeScript definition:
typescriptexport const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  plan_id: integer("plan_id").notNull(),
  status: text("status").default("active").notNull(),
  started_at: timestamp("started_at").defaultNow(),
  expires_at: timestamp("expires_at").notNull(),
  cancelled_at: timestamp("cancelled_at"),
  created_at: timestamp("created_at").defaultNow(),
});

// And the Zod schema + type:
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  created_at: true,
});
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
The variable names in TypeScript can be camelCase or snake_case (your choice — but be consistent within a project). The text("...") strings inside MUST exactly match the actual database column names (in this case, snake_case).
Step 8 — Test the app code
Restart the dev server. Verify:

App starts without errors
Existing pages still work
Any new feature using the new table works

Step 9 — Commit both files together
bashgit add migrations/manual/2026-05-15_add_subscriptions_table.sql shared/schema.ts
git commit -m "schema: add subscriptions table for membership program"
Atomic commit: SQL and TypeScript are inseparable — they describe the same change.

Common patterns
Adding a column to an existing table
SQL:
sqlALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
TypeScript (in shared/schema.ts, inside the users table definition):
typescriptphone_verified: boolean("phone_verified").default(false),
Adding an index
SQL:
sqlCREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
TypeScript: optional. Drizzle queries don't need to know about indexes — Postgres uses them automatically.
Adding a foreign key
SQL:
sqlALTER TABLE orders 
  ADD CONSTRAINT IF NOT EXISTS orders_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES users(id);
TypeScript:
typescriptuser_id: integer("user_id").references(() => users.id),
Renaming a column (DANGEROUS — coordinate carefully)
SQL:
sql-- Step 1: Add new column with same data
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
UPDATE users SET full_name = first_name || ' ' || last_name WHERE full_name IS NULL;

-- Step 2 (separate deploy): app code now uses full_name
-- Step 3 (separate deploy): drop old columns
-- ALTER TABLE users DROP COLUMN first_name;
-- ALTER TABLE users DROP COLUMN last_name;
Renames should always be 3-step deploys: add new, migrate code, drop old. Never combine.
Dropping a table or column (VERY DANGEROUS)
Don't. At least not without:

Confirming nothing in production code references it (grep the codebase)
Confirming nothing in production data is needed (export to CSV first)
Reviewing with a co-founder or technical advisor
Having a tested rollback plan

If you must drop:
sqlALTER TABLE users DROP COLUMN IF EXISTS old_field;
Always with a backup taken in the same session.

The "never do this" list

❌ Run npm run db:push (blocked but mentioning for completeness)
❌ Edit production database directly without writing the change to a SQL file first
❌ Apply schema changes during peak traffic hours
❌ Apply schema changes when tired
❌ Combine multiple unrelated schema changes in one migration file
❌ Use CREATE TABLE without IF NOT EXISTS
❌ Trust an AI tool's "this is safe" claim without reading the SQL yourself
❌ Skip taking a backup because "it's a small change"


When in doubt

Ask a developer
Test on a backup
Take more backups than you think you need
Wait until tomorrow if you're unsure

---

## Applied migrations log

### 2026-05-04 — `migrations/manual/2026-05-04_03_flat_pricing.sql`
**Author:** agent (Phase 2 prep — flat per-package pricing, BND)
**Summary:** Cuci Xpress does not distinguish vehicle size when pricing
washes; same wash, same price for any car. The original schema modelled
prices as a `(package × vehicle_size × branch_id)` matrix in
`package_pricing`. This migration replaces that matrix with a single
`packages.price_cents` column and drops the matrix table outright.

**Canonical catalogue (BND, owner-confirmed 2026-05-04):**
- `pkg_basic`           — Basic Wash                                B$8.00
- `pkg_basic_tyre`      — Basic Wash + Tyre Shine                   B$9.00
- `pkg_basic_wax`       — Basic Wash + Spray Wax                    B$11.00
- `pkg_basic_tyre_wax`  — Basic Wash + Tyre Shine + Spray Wax       B$12.00

**Steps in a single transaction:**
1. `ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_cents integer`.
2. Backfill from `package_pricing` (default-branch row only) when the
   table still exists, then unconditionally re-set `pkg_basic` to 800
   cents so a fresh DB without a `package_pricing` history still ends
   up correct.
3. Upsert the 3 new combo packages by `id`.
4. `ALTER TABLE packages ALTER COLUMN price_cents SET NOT NULL`.
5. `DROP TABLE IF EXISTS package_pricing`.

**Idempotent.** Re-running on a migrated DB: ADD COLUMN is a no-op,
backfill skips when `package_pricing` is gone, the UPDATE/INSERT use
`ON CONFLICT DO UPDATE` to converge to the canonical state, NOT NULL
is already set, and DROP uses `IF EXISTS`.

**Application code changes (same pass):**
- `shared/schema.ts`: added `price_cents` to `packages`; removed the
  `packagePricing` table definition, its insert schema, the `VehicleSize`
  type, and `PackagePricing` / `InsertPackagePricing` types.
- `server/routes.ts` `GET /api/pos/catalog`: returns `price_cents` per
  package; dropped the pricing-matrix join, the `prices_by_size`
  stitching, and the `vehicle_sizes` array in the response.
- `server/routes.ts` `POST /api/pos/orders`: removed `vehicle_size` from
  the request schema; price lookup is a plain `SELECT id, name,
  price_cents FROM packages WHERE id=$1 AND is_active=true`.
- `client/src/pages/pos.tsx`: removed the `VehicleSize` type, the
  `SIZE_LABELS` map, the vehicle-size state, the entire vehicle-size
  picker card, the size suffix in the order summary, and the
  `vehicle_size` field from the create-order POST body.

**Why no risk to historical orders:** `orders` never had a
`vehicle_size` column (verified pre-migration), and `orders.package_id`
is a plain `text` (no FK to `packages`), so the only consumer of
`package_pricing` was the live POS code path which we updated in the
same change.

**Status:** **APPLIED 2026-05-04** to staging Neon (1 → 4 packages,
`package_pricing` dropped, `price_cents` NOT NULL) and production Neon
(same — 1 → 4 packages, 0 orders affected since prod had 0 orders) via
`tsx scripts/_apply-2026-05-04-03.ts` (script self-deleted post-apply).

**Rollback:** Forward-only. To undo, recreate `package_pricing` with
the original schema, re-seed default-branch rows for each package, drop
`packages.price_cents`. Application code would need to be reverted to
the size-matrix flow.

### 2026-05-04 — `migrations/manual/2026-05-04_02_dedup_cars_plate_unique.sql`
**Author:** agent (Phase 1 follow-up — "Option 1: most recent owner wins")
**Summary:** One-time dedup of the 16 duplicate normalised-plate groups
that blocked a UNIQUE constraint in the original Phase 1 migration.
Owner-approved policy: a license plate is a unique identifier going
forward; among existing duplicates, keep the most recent owner.

**Winner-selection rule** (deterministic, encoded in SQL):
1. Real customer beats Cuci Xpress shop accounts
   (`cucixpress.user.bn+*@gmail.com` aliases that staff used to log
   walk-ins before the new `customers` table existed).
2. Otherwise, highest `cars.id` wins (most recent registration).

**Steps in a single transaction:**
1. Build a `_dedup_plan` temp table marking each row in a duplicate
   group as `winner` or `loser` per the rule above.
2. `UPDATE orders SET vehicle_id = winner.id` for any orders pointing
   at a loser (zero rows in prod — `orders.vehicle_id` only just landed
   in `2026-05-04_01`).
3. `DELETE FROM cars WHERE id IN losers` — 17 rows.
4. `DROP INDEX cars_plate_normalized_idx` (the non-unique functional
   index from `_01`) and `CREATE UNIQUE INDEX
   cars_plate_normalized_unique ON cars (UPPER(REGEXP_REPLACE(
   license_plate,'\s+','','g')))`.

**Idempotent.** Re-running on a deduped DB produces an empty
`_dedup_plan` (UPDATE/DELETE no-op) and the index DDL uses
`IF EXISTS` / `IF NOT EXISTS`.

**Status:** **APPLIED 2026-05-04** to staging Neon (empty DB, only the
unique index was created) and production Neon (cars 559 → 542 = 17
deletions, dup_groups 16 → 0, unique index installed, old non-unique
index dropped, 0 orders affected) via `tsx
scripts/_apply-2026-05-04-02.ts` (script self-deleted post-apply,
along with the read-only preview script `_preview-2026-05-04-02.ts`).

**Note on Phase 1 entry below:** The "Why no UNIQUE on `cars.license_plate`"
note is now obsolete — UNIQUE is in place. Trunk-user immutability
guarantee is unchanged: the POS upsert path still never overwrites a
non-null `cars.user_id`. Application code in `server/routes.ts` was
not changed; the existing find-by-normalised-plate-then-INSERT/UPDATE
path is now backed by a UNIQUE constraint that prevents any future
duplicate from being inserted.

**Rollback:** Forward-only. The 17 deleted rows are unrecoverable
without restoring from a Neon point-in-time snapshot.

### 2026-05-04 — `migrations/manual/2026-05-04_01_pos_customers_vehicles.sql`
**Author:** agent (Phase 1 of POS_CX feature port)
**Summary:** Phase 1 of the customer-and-vehicle normalisation work. Adds a
new `customers` table for POS walk-ins (phone-keyed, no login, optional FK to
`users` when they later self-register on the trunk app), extends the existing
`cars` table to also hold orphan + walk-in vehicles, and links `orders` to
the washed vehicle.

**Schema changes (one logical change in the migration):**
1. **NEW `customers`** — `id serial pk`, `phone text NOT NULL`, `name text
   NOT NULL`, `user_id integer NULL FK users(id) ON DELETE SET NULL`, `notes
   text`, `created_at`, `updated_at` (with BEFORE-UPDATE trigger
   `customers_set_updated_at`). UNIQUE index on `phone`, regular index on
   `user_id`.
2. **EXTEND `cars`** — relaxed `user_id`, `brand`, `model`, `type` to NULL
   (so POS-side rows that don't yet know brand/model can be inserted; all
   existing 559 trunk rows already have values, unchanged). Added
   `customer_id integer NULL FK customers(id) ON DELETE SET NULL`, `color
   text`, `last_seen_at timestamptz`. New indexes: `cars_customer_id_idx`,
   `cars_user_id_idx`, and a non-unique functional index
   `cars_plate_normalized_idx ON UPPER(REGEXP_REPLACE(license_plate,'\s+','','g'))`
   for plate autocomplete.
3. **EXTEND `orders`** — added `vehicle_id integer NULL FK cars(id) ON
   DELETE SET NULL` plus index `orders_vehicle_id_idx`. Existing
   `orders.customer_id` (FK to `users`) and `orders.customer_name_walkin`
   columns are unchanged; the POS uses `customer_name_walkin` for the
   POS-customer name on the receipt and leaves `customer_id` for trunk-user
   linkage.

**Why no UNIQUE on `cars.license_plate`:** Production has 17 duplicate
normalised plates today (e.g. `BAT4455` × 3 different users, `BAP2576` vs
`BAP 2576` formatting splits). A unique constraint would fail. The
duplicate cleanup is a separate task; for now, lookup uses the functional
index and picks the most-recently-seen match.

**Trunk-user immutability:** The new POS endpoints + the modified
`POST /api/pos/orders` insert path NEVER overwrite a non-null `cars.user_id`
when upserting by plate, and only set `cars.customer_id` when it is
currently NULL. Trunk vehicle ownership is read-only from the POS surface.

**Idempotency:** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, and `DO $mig$ … IF EXISTS … ALTER COLUMN …
DROP NOT NULL` blocks. Re-running the file is a no-op.

**Status:** **APPLIED 2026-05-04** to staging Neon (clean DB, 0 rows
affected) and production Neon (559 cars + 508 users untouched, 6/6
indexes installed) via `tsx scripts/_apply-2026-05-04-01.ts` (script
self-deleted post-apply). Verified post-apply: `customers` table present,
all 4 NOT-NULL relaxations on `cars` succeeded, `orders.vehicle_id`
present, all 6 indexes created.

**`shared/schema.ts`:** Added `customers` table definition with
`insertCustomerSchema` + `Customer` / `InsertCustomer` types; relaxed the
matching NOT NULLs on `cars` to mirror the DB; added `customer_id`,
`color`, `last_seen_at` columns to `cars`; added `vehicle_id` FK on
`orders`.

**New endpoints (all `requireStaff`-gated):**
- `GET /api/pos/customers/lookup?phone=` — customer + their vehicles + total spend
- `POST /api/pos/customers` — upsert by phone
- `GET /api/pos/vehicles/search?q=` — debounced plate autocomplete
- `GET /api/pos/vehicles/:id/history` — visit count, total spent, favourite branch, last 10 orders
- `POST /api/pos/vehicles` — upsert by normalised plate (never re-binds trunk-owned cars)

`POST /api/pos/orders` extended to accept optional `vehicle_id`,
`customer_phone`, `customer_name`; resolves/upserts the vehicle and
customer atomically inside the order create flow and writes
`orders.vehicle_id` + `orders.customer_name_walkin`.

**Rollback:** Forward-only. To undo, write a new migration that drops
`orders.vehicle_id`, then the 3 added `cars` columns, then `customers`.
Re-tightening the NOT NULLs would require backfilling any POS-inserted
rows first.



Append-only. Newest at the top.

### 2026-05-03 — `migrations/manual/2026-05-03_02_pos_sync_alignment.sql`
**Author:** agent (Week 2.2 plan execution)
**Summary:** Aligns the schema with the real Cuci Xpress operation after
analysing 129,185 rows of historical KedaiPOS exports
(`attached_assets/Master_Data_Cuci_Xpress_Sales_(2)_*.xlsx`,
2021-12-26 → 2026-04-30).

Five owner-confirmed changes:

1. **Packages — replaced placeholders with real menu.** The owner has
   ONE package, "Basic Wash", at flat **BND 8.00** for every car size,
   regardless of branch. The placeholder "Premium Wash" is dropped.
   `pkg_basic` description and duration (10 min) refreshed.
   `package_pricing` for `pkg_basic` now has 4 rows (one per
   `vehicle_size`) all priced at 800 cents, `branch_id` NULL.
2. **Addons — replaced placeholders with the real two:**
   `addon_tire_shine` $1.00 and `addon_spray_wax` $3.00 (both active).
   The 4 placeholders from `2026-05-03_01` (`addon_dashboard`,
   `addon_vacuum`, `addon_engine_bay`) are kept in the table but
   marked `is_active=false` so any historical order snapshot remains
   valid while they no longer appear in the POS UI.
   The combinations (Basic+Tire = $9, Basic+Wax = $11,
   Basic+Tire+Wax = $12) match the three dominant historical price
   points ($9 = 43%, $12 = 38%, $8 = 16%, total 97% of all transactions).
3. **`orders.payment_method` CHECK broadened.** Old set:
   `cash, card, qr, subscription, voucher`.
   New set: `cash, bank_transfer, card, qr_code, baiduri_pay,
   quick_pay, subscription, voucher`. `'qr'` rows (none in prod) are
   migrated to `'qr_code'`. The umbrella `qr_code` covers any QR
   provider; the specific provider goes in a new `qr_provider` text
   column (`pocket_pay`, `dst_easy`, etc.).
4. **14 new columns on `orders` for KedaiPOS sync:**
   `kedaipos_id`, `kedaipos_order_number`, `kedaipos_pos_name`,
   `original_receipt_no`, `customer_name_walkin`, `qr_provider`,
   `service_charge_cents`, `tax_cents`, `discount_cents`,
   `promo_discount_cents`, `paid_amount_cents`, `change_cents`,
   `order_notes`, `item_notes`. All optional or default 0; non-negative
   CHECK constraints added on every monetary column.
   Three new indexes: `orders_kedaipos_id_uniq` (partial unique on
   non-NULL), `orders_kedaipos_order_number_idx`,
   `orders_original_receipt_no_idx` (both partial on non-NULL).
5. **Pandan branch — explicitly NOT added.** Historical data shows
   22,632 transactions tagged "Pandan Branch" (KedaiPOS prefix `90-`),
   but the owner confirmed it is closed/planned-only. Will be added
   later if/when it re-opens.

**Status:** **APPLIED 2026-05-03** to staging Neon (`ep-curly-meadow`)
via `tsx scripts/migrate-staging.ts`, then to production Neon
(`ep-damp-frog`) via `psql -f`. Pre-apply prod backup saved at
`.local/db_backups/prod_20260503T005936Z_pre_pos_sync_alignment.sql.gz`.

**Verified post-apply (prod):**
- `packages` → 1 row (`pkg_basic`, active).
- `package_pricing` for `pkg_basic` → 4 rows, all 800 cents.
- `addons_catalog` → 5 rows total, 2 active (tire_shine 100,
  spray_wax 300), 3 inactive placeholders.
- `orders_payment_method_check` constraint definition shows the new
  8-element ARRAY.
- `orders` has all 14 new columns (verified via
  `information_schema.columns`).

**`shared/schema.ts`:** Added the 14 new optional columns to the
`orders` Drizzle table and exported a `PaymentMethod` string-literal
union that mirrors the broadened CHECK.

**Rollback:** Forward-only. To undo, write a new migration that:
(a) drops the 14 columns + 3 indexes from `orders`, (b) restores the
old `orders_payment_method_check` (after migrating any `qr_code`,
`bank_transfer`, `baiduri_pay`, `quick_pay` rows back to allowed
values), (c) restores `pkg_premium` + 4 placeholder pricing rows,
(d) re-activates the 3 inactive addons. The pre-apply backup
referenced above is the cleanest emergency restore path.

### 2026-05-03 — `migrations/manual/2026-05-03_01_packages_and_pricing.sql`
**Author:** agent (Week 2.1 plan execution)
**Summary:** Adds 2 new tables (`packages`, `package_pricing`) for the POS
catalog and per-vehicle-size price matrix. Seeds 2 default packages
(Basic Wash, Premium Wash), 8 pricing rows (4 vehicle sizes × 2 packages,
all `branch_id = NULL` = global default), and 4 rows in the existing
`addons_catalog` table (Tire Shine, Dashboard Polish, Interior Vacuum,
Engine Bay Wash). Zero changes to any of the 17 existing tables.
**Vehicle taxonomy decision:** `package_pricing.vehicle_size` is a CHECK-
constrained enum (`small`/`medium`/`large`/`xlarge`). The existing
`cars.type` column is free-text and contains 55 distinct values today
(incl. typos and a row with the value "Lambak"), so it cannot be used
as a FK or domain. A future cleanup migration will reconcile
`cars.type` → `vehicle_size` via a lookup table; until then, POS staff
pick the size at the lane.
**Branch override pattern:** `package_pricing.branch_id` is NULLable.
NULL = applies to every branch. A row with a specific `branch_id`
overrides the NULL row for that branch. The unique partial index
`package_pricing_unique_active_idx` enforces "one active price per
(package, size, branch)" using `COALESCE(branch_id, 0)` so NULL is
treated as a real key.
**Status:** **APPLIED 2026-05-03** to staging via `tsx scripts/migrate-staging.ts`
(verified: 2 packages, 8 pricing rows, 4 addons, idempotent re-run is no-op),
then to production via `psql $DATABASE_URL -f ...` after schema-only backup
to `.local/backups/prod_schema_before_2026-05-03_01.sql`. Verified post-apply:
2 packages, 8 pricing rows, 4 addons; existing row counts unchanged
(`branches=5`, `users=508`, `staff=5`); idempotent re-run on prod confirmed
(second `INSERT 0 0`).
**Prices:** PLACEHOLDER values only. Reasonable Brunei car-wash ballparks
(BND 5–25) but NOT confirmed by the owner. Must be updated via /admin or
a follow-up migration before the POS goes live.
**`shared/schema.ts`:** Added Drizzle definitions for `packages` and
`packagePricing` plus their insert schemas and inferred types. The
`VehicleSize` string-literal type is exported for use by POS UI code.
**Rollback:** Forward-only. To undo, write a new migration that drops
`package_pricing` then `packages` (in that order; cascade FK from pricing
to packages) and DELETEs the 4 seeded `addons_catalog` rows.

### 2026-05-02 — `migrations/manual/2026-05-02_01_auth_and_pos_prereqs.sql`
**Author:** agent (Week 1 plan execution)
**Summary:** Adds 8 new tables required for Lucia v3 auth and the POS surface
in a single forward-only migration. Tables: `staff`, `auth_sessions`,
`otp_codes`, `audit_log`, `lanes`, `addons_catalog`, `orders`, `subscriptions`.
Zero changes to the existing 9 tables. All FKs into existing tables use
`integer` to match `branches.id` and `users.id` (verified in
`docs/SCHEMA_VERIFICATION.md`). New tables use `text` PKs for
nanoid-style external IDs.
**Status:** **APPLIED 2026-05-02** to development DB via the Replit safe SQL
runner (single `BEGIN;...COMMIT;` call, atomic). Verified post-apply:
all 8 tables present in `information_schema.tables`; existing row counts
unchanged (`users=508`, `cars=559`, `branches=5`).
**Mid-flight fix:** First apply attempt failed with
`functions in index expression must be marked IMMUTABLE` because
`date(timestamptz)` is `STABLE`, not `IMMUTABLE`, and Postgres rejects
`STABLE` functions in index expressions. Fix: added a plain
`ticket_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date)`
column to `orders` and made the per-day uniqueness index reference that
column directly (`UNIQUE(branch_id, ticket_code, ticket_day)`). The default
is evaluated per-insert (where `STABLE` is allowed), and the index now
references plain columns only. App code can override `ticket_day` to use
the branch's local timezone if/when multi-timezone support lands.
`shared/schema.ts` was updated to mirror this column and to omit it from
`insertOrderSchema` (the DB default fills it in).
**Rollback:** Forward-only. To undo, write a new migration that drops the
8 tables in dependency order: `subscriptions`, `orders`, `addons_catalog`,
`lanes`, `audit_log`, `otp_codes`, `auth_sessions`, `staff`. Verify each
`DROP` against then-current foreign-key references first.

---

## 2026-05-04 — Phase 2: memberships (wash-pack model)

**Migration:** `migrations/manual/2026-05-04_04_memberships.sql`
**Applied to:** staging ✓, prod ✓ (same day).

**What changed (plain English):** Cuci Xpress doesn't sell "monthly
unlimited" subscriptions — they sell prepaid wash-packs. A customer
walks in, pays B$X up front, gets N washes (typically 10), and
redeems them over time at any branch. The pack may optionally be
pinned to a specific car so it can't be used on a different vehicle.
We needed a schema that captures the pack itself, decrements the
balance per redemption, and keeps an audit row for every wash used.

**Tables:**
- Dropped: `subscriptions` (unused stub, 0 rows in both DBs).
- New: `memberships`
  - `customer_id NOT NULL → customers(id)`
  - `vehicle_id → cars(id)` (nullable; null = any of the customer's cars)
  - `total_washes`, `remaining_washes` (CHECK: 0 ≤ remaining ≤ total)
  - `price_cents` (BND, snapshot at sale)
  - `status` ∈ {active, exhausted, expired, cancelled}
  - `expires_at` (nullable)
  - `sold_by_staff_id NOT NULL → staff(id)` (audit)
  - `sold_at_branch_id NOT NULL → branches(id)` (audit)
- New: `membership_redemptions` — one row per wash consumed
  - `membership_id → memberships(id)`
  - `order_id → orders(id)` (UNIQUE — an order is at most one redemption)
  - `staff_id → staff(id)` (who rang it up)

**Indexes:**
- `memberships_customer_status_idx (customer_id, status)`
- `memberships_vehicle_status_idx (vehicle_id, status) WHERE vehicle_id IS NOT NULL`
- `memberships_branch_created_idx (sold_at_branch_id, created_at DESC)`
- `membership_redemptions_order_uniq (order_id)` — UNIQUE
- `membership_redemptions_membership_idx (membership_id, created_at DESC)`

**FK type note:** `sold_by_staff_id` and redemption `staff_id` reference
`staff(id)` (text) — NOT `users(id)` (integer). This matches how
`orders.staff_id` is wired (see schema.ts: `staff_id: text(...).references(() => staff.id)`).
The trunk `users` table is for end-user accounts; `staff` is the POS
auth table for cashier/lane/manager/owner roles.

**Server flow (`POST /api/pos/orders` refactor):** The whole order-
create now runs in a single `db.transaction`. When `payment_method =
'subscription'`, the txn:
1. Locks the membership row `FOR UPDATE`.
2. Validates: belongs to the resolved customer, status='active',
   remaining_washes > 0, not expired, vehicle pin (if any) matches.
3. Inserts the order with `discount_cents = subtotal_cents` and
   `total_cents = 0`.
4. Inserts a `membership_redemptions` row (UNIQUE on order_id catches
   any future double-redemption bug).
5. Decrements `remaining_washes`; flips status to 'exhausted' at zero.

A failure at any step rolls back everything — no leaked washes, no
orders without an audit trail.

**New endpoints:**
- `GET /api/pos/memberships/active?customer_id=N[&vehicle_id=N]` — for
  the POS badge.
- `POST /api/pos/memberships` — sell a pack (any staff role).
- `GET /api/pos/memberships?customer_id=N` — pack history for a customer.

**UI:** POS surface (`client/src/pages/pos.tsx`) now shows a green
"Wash pack: 7/10 left" pill in the matched-vehicle card whenever an
active pack exists for the customer. When the cashier picks
"Subscription" payment AND a pack is on file, the order summary shows
a "Wash pack redemption" discount line and the total drops to B$0.
Submit is blocked when subscription is selected without an active pack.

**Pricing model (Phase 2 simplification):** A redemption covers the
full subtotal, including addons. Future refinement (per-line discount,
addon-only-cash-charge) can layer in once the Owner has feedback from
real cashier use.

---

## 2026-05-04 — Phase 2.1: membership kind (pack vs unlimited)

**Migration:** `migrations/manual/2026-05-04_05_membership_kind.sql`
**Applied to:** staging ✓, prod ✓ (same day).

**What changed (plain English):** Cuci Xpress also sells an "unlimited
washes for 1 month" product alongside the prepaid wash-pack. Same
table, but the gate is *time* (expires_at) instead of *count*
(remaining_washes). Added a `kind` column ∈ {'pack', 'unlimited'} so
both shapes coexist on `memberships`.

**Schema delta:**
- `memberships.kind text NOT NULL DEFAULT 'pack'`
- Dropped: `memberships_total_positive` (replaced by kind-aware checks)
- Added: `memberships_kind_valid` — `kind IN ('pack','unlimited')`
- Added: `memberships_pack_has_washes` — packs must have `total_washes > 0`
- Added: `memberships_unlimited_has_expiry` — unlimited rows must have `expires_at IS NOT NULL`

For unlimited rows, `total_washes` and `remaining_washes` are stored
as 0 (the columns are unused for that kind; the existing
`remaining_le_total` and `remaining_nonneg` checks still hold).

**Server logic:**
- Active lookup (`GET /api/pos/memberships/active`): condition is now
  `(kind = 'unlimited' OR remaining_washes > 0)` — unlimited bypasses
  the count gate, expiry filter still applies to both kinds.
- Redemption (`POST /api/pos/orders` subscription branch):
  - Pack: existing flow — must have washes left, decrement, flip to
    'exhausted' at zero.
  - Unlimited: skip the count check and skip the decrement. Only the
    redemption row is written; status stays 'active' until `expires_at`
    passes (server-side rejection on next attempt). No background cron
    needed for Phase 2.1.
- Sell (`POST /api/pos/memberships`): now accepts `kind`. Schema-level
  refinements enforce that packs send `total_washes > 0` and unlimited
  rows send `expires_at`.

**UI:**
- The green pill in the matched-vehicle card now reads "Unlimited ·
  until 12 Sep" for unlimited memberships and "Wash pack: 7/10 left"
  for packs.
- The order summary discount line says "Unlimited pass" or "Wash pack
  redemption" depending on which kind covered the order.

### Follow-up same day — lazy expiry sweep

To keep `memberships.status` accurate for reporting (instead of leaving
expired rows with `status='active'` and rejecting them at runtime), the
three membership-touching endpoints now run a tiny idempotent sweep
before their main query:

```sql
UPDATE memberships
   SET status = 'expired'
 WHERE status = 'active'
   AND expires_at IS NOT NULL
   AND expires_at < now()
```

Locations:
- `GET /api/pos/memberships/active` (top of handler)
- `GET /api/pos/memberships` (top of handler)
- `POST /api/pos/orders` when `payment_method='subscription'` (before
  the txn opens — outside the txn so the flip persists even if the
  redemption itself rolls back)

The partial filter is highly selective — touches at most a handful of
rows per request, costs nothing on a cold table. No cron job needed.

---

## 2026-05-04_06 — `lpr_attempts` (Phase 3 LPR audit log)

New table backing automatic license plate recognition on POS. Staff
snap a photo of the arriving car (camera or gallery), the server
forwards it to Gemini 2.5 Flash, and we log every attempt for 30 days
so the owner can audit false positives.

**Columns:**
- `id text PK` — `lpr_<base36>_<rand>`
- `staff_id text → staff(id)`
- `branch_id integer → branches(id)`
- `recognized_plate text` (NULL if Gemini saw nothing)
- `confidence numeric(4,3)` (0-1, NULL if model didn't return one)
- `matched_vehicle_id integer → cars(id)` (NULL when no row matched)
- `raw_response text` — Gemini's full reply, for debugging
- `image_bytes bytea` — the captured photo (cleared at 30 days)
- `image_mime text`, `image_size_bytes integer`
- `created_at timestamptz default now()`

**Constraints:** `confidence ∈ [0,1] OR NULL`, `image_size_bytes > 0`.
**Indexes:** `created_at`, `(branch_id, created_at DESC)`,
`(staff_id, created_at DESC)`.

**Retention:** 30-day lazy DELETE sweep runs on every recognize call
(non-fatal if it fails). Mirrors the membership-expiry pattern.

**Endpoint:** `POST /api/pos/lpr/recognize` body
`{ image_base64, image_mime, branch_id }` — fails soft to 503
`lpr_unavailable` on Gemini error so cashier can keep typing plates
by hand. Branch authorisation matches `POST /api/pos/orders`.

Applied to staging + prod 2026-05-04.

---

## 2026-05-04_07 — `orders` refund columns (Phase 4)

Adds full-order refund support. Owner decisions:
- ANY staff can refund (no manager PIN gate).
- FULL ORDER ONLY (no partials).
- Subscription orders DO NOT credit the wash back to the pack —
  membership_redemptions stays, remaining_washes stays decremented.
  Refund only voids the order line for reporting.

**Schema changes on `orders`:**
- `refunded_at timestamptz` (NULL unless refunded)
- `refunded_by_staff_id text → staff(id)` (who issued)
- `refund_reason text` (optional free-text)
- `orders_status_check` REPLACED to allow new `'refunded'` value
- New `orders_refund_fields_consistent` CHECK: refund fields are
  populated together when status='refunded', NULL otherwise
- Partial index `idx_orders_refunded_at (branch_id, refunded_at DESC)
  WHERE status='refunded'` for "today's refunds at branch X" reporting

**Endpoint:** `POST /api/pos/orders/:id/refund` body `{ reason? }`
- Runs in a txn with FOR UPDATE
- Lane/cashier limited to their own branch (mirrors POS order create)
- 409 `already_refunded`, 404 `not_found`, 403 `branch_mismatch`

**UI:** Each row in the POS Today feed gets a small "Refund" button.
After refund, the row shows strike-through ticket code, red −B$X.XX,
and a "Refunded" badge with the reason underneath if provided.

Applied to staging + prod 2026-05-04.

---

## Phase 5a — Owner Dashboard + Order Report (no schema change)

Read-only admin endpoints over the existing tables. **No migration.**

- `GET /api/admin/dashboard?branch_id=N|all&date=YYYY-MM-DD`
  Returns 12 KPI tiles (today's transactions, sales, avg sales, items
  sold, refund count, total refunds, avg refund, net sales, active
  staff today, active customers today, total staff, total customers)
  + a 24-hour `[{hour, sales_cents, refund_cents}]` array for the
  hourly area chart. All time math runs in Asia/Brunei (UTC+8).

- `GET /api/admin/reports/orders` with filters:
  `branch_id`, `from`, `to` (ticket_day range, default = today),
  `payment_method`, `staff_id`, `search` (>=2 chars on ticket_code /
  plate / customer_name_walkin), `page`, `per_page` (10..200).
  Returns aggregates (transactions, net_sales, refunds, items_sold,
  averages) plus paginated rows joined to `branches` + `staff`.

Both endpoints require `requireStaff` + `requireStaffRole('owner','manager')`.

Surfaced in `/admin` as two new tabs: **Dashboard** (default) and
**Order Report**, sitting alongside the existing Collaborations and
Subscriptions tabs.

Phase 4 follow-up: fixed `refundOrder` mutation in `pos.tsx` —
`apiRequest` returns the raw `Response`, so we now `await res.json()`
inside the mutation to actually consume the body.

---

## Phase 5a addendum — Bulk export to Excel for Power BI (no schema change)

`GET /api/admin/reports/orders/export` — same query string as
`/api/admin/reports/orders` (branch, date range, payment method,
staff, search), no pagination. Streams an `.xlsx` file with the
**25-column "Master Sales Data"** layout the owner already feeds
into Power BI:

```
Source.Name, ID, Receipt Date, Receipt Time, Store Name, POS Name,
Employee Name, Is Refund, Original Receipt No, Order Number,
Customer Name, Payment Type, Subtotal, Discount Total,
Promocode Discount Total, Service Charge Total, Tax Total,
Order Total, Paid Amount, Change, Order Notes, Item Notes,
Extracted_Brand, Extracted_Model, License_Plate
```

Receipt Date / Time emitted as Excel serials in Asia/Brunei wall
clock (parity with the historical KedaiPOS xlsx). Payment methods
are mapped back to KedaiPOS labels (`cash` → "Cash",
`bank_transfer` → "Bank Transfer", `qr_code` + provider →
"Pocket Payment QR" / "Quickpay" / "Baiduri MS Payment Request",
etc.) so existing Power BI dashboards keyed on string values keep
working unchanged. Refunded rows are emitted as a single line with
`Is Refund=Yes` and `Order Total` carrying the refund amount —
matching how our refund flow stores them (we don't generate a
separate negative row).

Hard-capped at 100,000 rows per call → 413 with
`{ error: 'too_many_rows', row_count, row_cap, hint }` if exceeded.
Surfaced in the Order Report tab as a "Export to Excel" button next
to Search/Reset; the client downloads via Blob and gets the
auto-generated filename `cucixpress_master_sales_<from>_to_<to>_<utc>.xlsx`.

Owner/manager only via `requireStaffRole`. Uses the existing
`xlsx@^0.18.5` package — no new deps.

---

## Phase 5b — Payment Methods + Best Selling reports (no schema change)

Two new admin endpoints, owner/manager only, on the existing tables.

- `GET /api/admin/reports/payment-methods?branch_id=&from=&to=`
  Aggregates orders by `payment_method` × `qr_provider` for the
  date range. Returns `transactions`, `paid_count`, `refund_count`,
  `sales_cents`, `refund_cents`, and `share_pct` (% of total sales).

- `GET /api/admin/reports/best-selling?branch_id=&from=&to=&limit=`
  Counts package + addon line-items across non-refunded orders.
  Each order contributes 1 package row (from `orders.package_name`
  + `orders.package_id`) plus one row per addon unwrapped from
  `orders.addons` jsonb. Package revenue = `total_cents` minus the
  sum of addon snapshot prices, so package + addons sum back to
  the order total. `limit` clamped to 5..100, default 25.

Both endpoints reuse the same Asia/Brunei `ticket_day` filter as
the existing reports. Surfaced in `/admin` as two new tabs
(**Payment Methods**, **Best Selling**) alongside Dashboard / Order
Report. Tab strip widened from 4 to 6 columns on desktop.

---

## Phase 5c — Catalog management: Packages + Add-ons (no schema change)

Owner-only CRUD over the existing `packages` and `addons_catalog`
tables. Manager role intentionally NOT included — pricing edits are
owner-only (reports/refunds remain manager-allowed).

Endpoints:
- `GET    /api/admin/catalog/packages` (lists all + per-row order_count)
- `POST   /api/admin/catalog/packages`
- `PATCH  /api/admin/catalog/packages/:id`
- `DELETE /api/admin/catalog/packages/:id` — soft (is_active=false)
  by default. `?force=1` hard-deletes when no order has ever
  referenced the row, otherwise returns 409 `{error:'in_use',
  order_count}`.
- Same shape for `/api/admin/catalog/addons` (usage counted by
  unwrapping `orders.addons` jsonb and matching `a->>'id'`).

Body validation via Zod: `name 1–120`, `price_cents 0..100_000`,
`duration_minutes 1..600 | null`, `sort_order 0..999`. The POST/
PATCH branches reuse one schema (PATCH = `.partial()`).

Surfaced in `/admin` as a new **Catalog** tab containing two stacked
sections (Packages, Add-ons), each with an inline edit dialog.
Tab strip widened from 6 to 7 columns on desktop. Non-owners see a
read-only view with an amber banner instead of buttons.

Skipped this phase: **promotions / promo codes** — owner deferred
(they have none today). Will be revisited later if promo support is
needed at the till.

---

## 2026-05-04_08 — Branch-scoped packages

New join table `package_branches (package_id text, branch_id integer,
PK composite)` plus an index on `branch_id`. Adds a many-to-many
between packages and branches so the Tungku-only Interior Cleaning
package no longer appears at other tills.

**Empty-set semantics: a package with NO rows in `package_branches`
is treated as "available at all branches"** — both the POS read
filter and the admin UI follow this convention. This lets the seven
existing packages keep working without any data migration; they just
stay empty in the new table.

API surface:
- `GET /api/admin/branches` (owner+manager) — small helper used by
  the package edit dialog.
- `GET /api/admin/catalog/packages` now returns `branch_ids: number[]`
  per row (sorted, empty = all).
- `POST/PATCH /api/admin/catalog/packages` accept optional
  `branch_ids`. Rewriting is destructive-replace within a single
  helper (`rewritePackageBranches`) so a partial failure can't leave
  the join half-rewritten. PATCH only touches the join when the field
  is explicitly present (i.e. `branch_ids: []` is a valid "switch to
  all branches" instruction; absent means "don't change").
- `GET /api/pos/catalog?branch_id=X` filters packages by branch using
  `(NOT EXISTS … OR EXISTS branch_id = X)`. POS now passes its active
  `branch_id` and re-keys the query so a branch switch refetches.

Add-ons remain global per owner direction (universal upsells).

---

## 2026-05-04_10 — Web checkout → CRM wiring (Phase 12a)

Until now, when a customer paid online via the trunk's `/checkout`
flow we sent them to Pocket Pay but wrote **nothing** to our DB.
`/api/save-customer` was a console.log no-op, and `/api/process-payment`
only round-tripped to Pocket Pay. Result: staff couldn't see prepaid
orders in the POS; the customer dashboard's wash history showed only
in-store walk-ins; memberships, loyalty, and CRM were blind to online
payments.

Three small, additive schema changes unblock the wiring (no rewrite
of the payment flow itself):

1. **`orders.status` allows `'pending_payment'`** alongside the
   existing six values. `/api/process-payment` inserts a row with
   this status the moment a Pocket Pay link is created, so the
   wash exists in the CRM immediately. `/api/payment-callback`
   flips it to `'paid'` (success) or `'voided'` (failure /
   cancelled).
2. **`orders.ticket_code` is now nullable** so a `pending_payment`
   row can exist before staff allocates a T-NNN lane ticket (which
   still happens at QR-scan time, identical to the in-store flow).
   The existing UNIQUE INDEX on `(branch_id, ticket_code, ticket_day)`
   already permits multiple NULLs (Postgres btree default).
3. **Partial UNIQUE index `idx_orders_pocket_pay_payment_ref`** on
   `payment_ref WHERE qr_provider='pocket_pay'`. Makes the Pocket
   Pay callback idempotent — a re-delivered callback gets a 23505
   on duplicate insert attempts and a no-op on the status flip
   (gated by `status='pending_payment'`). Cash/card `payment_ref`
   values (KedaiPOS receipt numbers etc.) are unaffected by the
   partial gate.

Customer + vehicle linkage mirrors the existing POS upsert path
(`/api/pos/orders`):
- `customers` upsert by phone (preserves existing name on conflict;
  new rows get a `"Online: <plate>"` placeholder name).
- `cars` upsert by normalised plate, linked to the customer, with
  `last_seen_at` bumped.
- `orders` row inserted with `customer_id`, `vehicle_id`, `plate`,
  `package_id` (resolved by name or amount-cents match against the
  packages catalog), `qr_provider='pocket_pay'`, and
  `payment_ref=<pocket_pay order_id>`.

The DB write is wrapped in try/catch — a hiccup must NOT break the
customer's payment flow, because they already have a working Pocket
Pay link by that point. Failed inserts log loudly and can be
backfilled from Pocket Pay's transaction list later.

The customer dashboard (`/api/customer/orders`, joining via
`cars.customer_id`) **auto-populates** with online washes the
moment a customer signs up later with the same phone — no dashboard
endpoint changes needed.

**Not in this phase (deliberately):**
- Staff QR-scan-in (`/api/verify-qr`) still uses the old mock data
  path. Phase 12c will rewrite it to look up the order by
  `payment_ref`, allocate a T-NNN ticket, and flip status to
  `'queued'` — putting the prepaid wash into the same lane queue
  as a walk-in.
- A status-poll cron for `pending_payment` rows older than 24h.
  For now they stay visible in the CRM and can be reconciled by
  hand.

---

## 2026-05-05 — Phase 12b: pending payments, CSV export, segments

No schema changes — all three pieces ride on the existing
`customers` / `cars` / `orders` tables and the new
`pending_payment` status from Phase 12a.

### 12a polish
- `/api/admin/customers/:id` now returns `qr_provider` on each
  order so the CRM can mark web-checkout washes with an "Online"
  badge and render `pending_payment` / `voided` states with the
  appropriate amber/grey badge instead of generic styling. Orders
  whose `ticket_code` is still NULL show "awaiting scan" rather
  than a blank cell.

### 12b-1 — Pending payments reconciliation
- `GET /api/admin/orders/pending-payments` lists every
  `status='pending_payment'` order with age, customer info, branch,
  amount, and Pocket Pay reference. Owner+manager only.
- `POST /api/admin/orders/:id/void-pending` flips a single pending
  row to `'voided'`. The `WHERE status='pending_payment'` guard
  makes it safe against races: if a Pocket Pay callback lands
  after a manual void, the callback's own `WHERE status='pending_payment'`
  guard prevents it from overriding us.
- Frontend renders a panel at the top of the Customers tab. When
  count is zero it collapses to a thin green "all clear" line. When
  there are pending rows it shows an amber-bordered table with
  per-row Void buttons (require an explicit "Confirm void" click
  to prevent fat-finger errors). Polls every 30 s.

### 12b-2 — CSV export
- `GET /api/admin/customers/export.csv` reuses the same
  search / branch / segment filters as the list endpoint, drops
  pagination (cap 10k rows), and streams a UTF-8-BOM CSV with
  columns: id, name, phone, plates (semicolon-joined), vehicles,
  visits, lifetime_spend_bnd, last_visit_at (ISO), created_at (ISO).
- Frontend exposes an "Export CSV" button next to the result count.
  The href carries the active filters so the downloaded file
  matches what the user is looking at.

### 12b-3 — Customer segments
- `GET /api/admin/customers` accepts a new `segment` query param,
  validated against an explicit allow-list. Five presets land in
  this phase:
  - **vip** — lifetime spend (excl. refunds) ≥ B$500
  - **at_risk** — 2+ paid visits AND last visit > 30 days ago
  - **online** — has any order with `qr_provider='pocket_pay'`
  - **multi_branch** — visited 2+ distinct branches
  - **new** — `customers.created_at` within last 14 days
- Each segment is a composable Drizzle SQL fragment evaluated
  against alias `c`, so the same fragments slot into both the
  paginated list query and the CSV export query without
  duplication.
- Frontend adds a Segment dropdown next to the branch filter. The
  filter row shows a one-line hint describing the active segment
  and the total match count, so the user always knows what they're
  looking at before exporting.

**Not in this phase (deliberately):**
- Saved/custom segments (just the five presets for now)
- A 24-hour cron to auto-void abandoned `pending_payment` rows
  (manual void via the panel covers it for now)
- SMS/WhatsApp blast to a filtered list (needs a third-party
  gateway — Phase 13+)

---

## 2026-05-05 — Phase 12c: prepaid lane scan-in via /api/verify-qr

No schema changes — uses Phase 12a's `payment_ref` (Pocket Pay
`order_id`) and the existing T-NNN ticket sequence.

### What changed
- `POST /api/verify-qr` (`requireStaff`) was rewritten from a mock
  validator into the real prepaid scan-in endpoint:
  1. Parse the QR JSON, expect `type='CUCI_XPRESS_PAYMENT'` and a
     non-empty `order_id` (the Pocket Pay reference baked into the
     QR by `PaymentReceipt`).
  2. `SELECT ... FOR UPDATE` the order by
     `qr_provider='pocket_pay' AND payment_ref=<order_id>`. Status
     gates:
     - **404 `order_not_found`** — no row matches (legacy receipt
       or wrong provider).
     - **402 `payment_pending`** — `status='pending_payment'`.
       Pocket Pay callback hasn't landed yet; staff tells the
       customer to wait or pay again.
     - **409 `voided` / `refunded`** — do not service this car.
     - **200 idempotent** — already `queued`/`washing`/`done`
       with a `ticket_code`. Returns the existing ticket.
  3. Otherwise (`status='paid'`, `ticket_code IS NULL`), allocate
     the next T-NNN for `(branch_id, ticket_day=today UTC)` using
     the same `MAX(regexp_replace(ticket_code, '\D', '', 'g'))+1`
     pattern as `/api/pos/orders` so prepaid + walk-in tickets
     share one stream per branch per day.
  4. `UPDATE ... SET ticket_code=$1, status='queued',
     ticket_day=today WHERE id=$2 AND status='paid' AND
     ticket_code IS NULL RETURNING ...`. The `WHERE` guard makes
     the whole flow safe against two staff scanning the same QR
     at the same instant — second scan's UPDATE matches zero rows,
     it re-reads, and returns the same ticket.

### Response shape (success)
```
{
  success: true,
  message: "Ticket allocated" | "Already in queue",
  newly_allocated: true | false,
  order: {
    id, ticket_code, plate, package_name, total_cents,
    branch_id, branch_name, status,
    customer: { name, phone } | null,
    is_prepaid: true
  }
}
```

### Smoke tests passed
- Lookup by `payment_ref` returns the row with `status='paid'`,
  `ticket_code=NULL`.
- First scan allocates `T-001`, flips `status='queued'`.
- Second scan: UPDATE matches 0 rows → idempotent return of
  same `T-001`.
- `status='voided'` row is gated by the status check.
- Unknown `payment_ref` returns 0 rows → 404 path.

### Not in this phase (deliberately)
- A staff-facing scanner UI (camera + form). The endpoint is
  ready; the front end can be built in a later phase or live
  inside the existing third-party POS.
- Replacing the legacy `transaction_id`-only QR contents — the
  current `PaymentReceipt` already embeds `order_id`, so all new
  receipts work. Customers holding pre-12a receipts will hit the
  `order_not_found` branch and be handled manually.

---

## 2026-05-05 — Phase 12c-ui: Scan In tab for staff

No schema changes — pure frontend on top of Phase 12c's
`/api/verify-qr` endpoint.

### What changed
- New `client/src/components/admin/ScanInTab.tsx`. New `Scan In`
  tab in `client/src/pages/admin.tsx`, sitting right after the
  Dashboard tab. Visible to **all staff** (not just managers/
  owners) — lane workers are the primary users of this screen.
- Two side-by-side panels:
  - **Camera scan** — uses `html5-qrcode` (newly installed) via
    a dynamic import so the lib only ships when the staff opens
    the tab. Start/stop button. `facingMode: environment` so
    phones use the rear camera. Auto-stops on a successful scan
    so the staff can read the result without it firing again.
    A 1.5 s in-flight cooldown prevents the scanner from
    hammering the API on every decoded frame.
  - **Manual paste** — a `Textarea` + Verify button. Always
    available so staff can fall back when the camera is blocked
    (HTTPS issues, denied permission, dim screen, broken lens).
- Result rendering:
  - **Success (newly_allocated=true)** — green-bordered card
    with a huge `T-NNN` ticket in mono, prepaid badge, and a
    details column (plate, package, branch, amount, customer
    name + phone if linked).
  - **Success (already in queue)** — same layout, blue border,
    "Already in queue" headline.
  - **Errors** — colour-coded by error code:
    - `payment_pending` → amber, Clock icon, "Payment not yet
      confirmed"
    - `voided` / `refunded` → rose, Ban icon
    - `order_not_found` → slate, Search icon
    - `network_error` → slate, AlertCircle icon
  - Each result has a "Scan another" / "Try again" button that
    resets the panel.
- A toast confirms each successful scan with the ticket code +
  plate so staff hear feedback even if they're not looking at
  the screen.

### Dependencies
- `html5-qrcode` added (~250KB, single file, no peer deps,
  works on iOS Safari).

### Not in this phase (deliberately)
- Sound/haptic feedback on scan
- Recent-scans history (would need a state store; staff can
  re-look-up by re-scanning if needed)
- Lane queue display embedded on the same screen (the existing
  `/queue` page already covers this and is open in another tab
  on most lane displays)

---

## 2026-05-05 — Phase 12c-ui follow-up: Scan In moved to /pos

User feedback: cashiers live in `/pos`, so the Scan In tool
belongs there, not buried in `/admin`.

### What changed
- Removed the **Scan In** tab from `client/src/pages/admin.tsx`
  (tab trigger, tab content, import, and the `QrCode` icon
  import all rolled back).
- Added a **Scan QR** button to the `/pos` header CTA row, sitting
  between the Shift bar and the Reports button. Filled with the
  brand purple so it's the most visually prominent CTA in the
  header — that's where the cashier's eye lives during a busy
  lane.
- The button opens a shadcn `Dialog` containing the same
  `ScanInTab` component (no copy-paste — single source of truth).
  Closing the dialog unmounts the tab, which fires the cleanup
  effect that stops the camera, so we don't leave a zombie
  webcam stream running in the background.
- `ScanInTab` itself stays exactly where it was at
  `client/src/components/admin/ScanInTab.tsx` — the path is
  legacy now but moving the file would just create churn.

### Not in this phase
- Auto-refreshing the POS "today's orders" list when a scan
  succeeds (the existing 30 s polling picks it up; can be made
  reactive via `queryClient.invalidateQueries` later if cashiers
  feel the lag).

---

## 2026-05-05 — Phase 12d: Lane control

Closed the gap that orders were entering the queue but never
leaving it. The public live-queue widget previously showed a
forever-growing "in queue" count because no one could mark cars
as washing or done.

### Backend
- New endpoint **`PATCH /api/pos/orders/:id/status`** in
  `server/routes.ts` (right after the refund endpoint).
- Body: `{ to: 'washing' | 'done' }`. Strict state machine:
  - `queued` → `washing` (start the wash)
  - `washing` → `done`  (car drove out)
- Idempotent: PATCHing to the current status returns the row as
  a no-op instead of erroring (handles double-tap on tablets).
- Hard gates that return 409:
  - skipping (queued → done)
  - rewinding (done → washing)
  - touching closed states (refunded, voided, pending_payment)
- Branch lock: lane/cashier can only advance orders at their own
  branch; owner/manager can advance any branch. Same pattern as
  the refund endpoint.
- Wrapped in a `db.transaction` with `SELECT ... FOR UPDATE` so
  two phones tapping the same row at the same instant can't
  corrupt the state.

### Frontend
- New `LaneControl` component at the bottom of
  `client/src/pages/pos.tsx` (sibling to `POS()`, ~150 LoC).
- Rendered in the right column of `/pos` between the order-
  summary card and the Today panel.
- Reads from the existing `/api/pos/orders/today` query (which
  already polls), filters client-side to `queued` + `washing`
  rows — no extra request.
- Two sections:
  - **Washing now** — cards with the cuci-secondary tint and a
    green "Mark done" button per row.
  - **Up next** — numbered queue (oldest first) with a purple
    "Start wash" button per row.
- After a successful PATCH, invalidates both
  `["/api/pos/orders/today", branchId]` (so the card itself
  refreshes) and `["/api/queue/snapshot"]` (so the public
  /queue page + homepage widget update within one tick).
- Toast on success and on failure.

### Smoke gates (all PASS)
1. queued → washing — row updated
2. washing → done — row updated
3. done → washing — 0 rows updated (gate blocks the rewind)
4. queued → done — 0 rows updated (gate blocks the skip)

### Not in this phase
- "Undo" button if a cashier marks the wrong car done. Today the
  fix is a manual SQL fix; can be added later as a 60-second
  reverse window.
- No new database columns. No migration required.
