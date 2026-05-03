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
