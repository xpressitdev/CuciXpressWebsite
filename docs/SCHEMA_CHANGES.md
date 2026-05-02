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

Append-only. Newest at the top.

### 2026-05-02 — `migrations/manual/2026-05-02_01_auth_and_pos_prereqs.sql`
**Author:** agent (Week 1 plan execution)
**Summary:** Adds 8 new tables required for Lucia v3 auth and the POS surface
in a single forward-only migration. Tables: `staff`, `auth_sessions`,
`otp_codes`, `audit_log`, `lanes`, `addons_catalog`, `orders`, `subscriptions`.
Zero changes to the existing 9 tables. All FKs into existing tables use
`integer` to match `branches.id` and `users.id` (verified in
`docs/SCHEMA_VERIFICATION.md`). New tables use `text` PKs for
nanoid-style external IDs.
**Status:** Authored, awaiting manual `psql` apply.
**Rollback:** Forward-only. To undo, write a new migration that drops the
8 tables in dependency order: `subscriptions`, `orders`, `addons_catalog`,
`lanes`, `audit_log`, `otp_codes`, `auth_sessions`, `staff`. Verify each
`DROP` against then-current foreign-key references first.
