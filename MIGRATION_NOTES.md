Database Migration Strategy
Last updated: 2026-05-02
Status: Authoritative — read before any database schema work

TL;DR
We do NOT use Drizzle's migration tooling. We use Drizzle ONLY as a query builder. Schema changes are made via raw SQL files that are reviewed and applied manually.
See docs/SCHEMA_CHANGES.md for the exact workflow.

⚠️ FORBIDDEN COMMANDS
These commands have been blocked in package.json and must NEVER be run:

npm run db:push
npx drizzle-kit push
npx drizzle-kit generate
npx drizzle-kit migrate
npx drizzle-kit introspect

If you bypass the npm script blocks and run npx drizzle-kit ... directly, stop. Read this document. The same logic applies.

Why we don't use Drizzle migrations
The CucumberShowcase database (cucixpress.com) was consolidated with the CuciXpressLiveQue database on 2026-05-02. Both apps now share one Neon database.
The database has 9 tables and 508+ real customers. Drizzle's migration system does NOT have a baseline of this database state. Every time drizzle-kit generate runs, it produces a "fresh database" migration with CREATE TABLE statements (no IF NOT EXISTS) that would error against the existing database.
Establishing a proper Drizzle baseline requires drizzle-kit introspect, which requires a drizzle-orm version upgrade (currently 0.39.3, needs 0.40.0+). That upgrade introduces dependency risk we've decided not to take.
Instead, we treat Drizzle as a typed query builder (which it does excellently) and handle schema changes ourselves with plain SQL.

What Drizzle IS used for

Type-safe queries: db.select().from(users).where(eq(users.id, id))
Type-safe inserts: db.insert(table).values(data).returning()
TypeScript schema definitions in shared/schema.ts
Zod schema validation via drizzle-zod

These all work fine without the migration system.

What to do when the schema needs to change
See docs/SCHEMA_CHANGES.md for the full step-by-step procedure.
Quick summary:

Edit shared/schema.ts (the TypeScript types)
Write the actual SQL change in migrations/manual/YYYY-MM-DD_description.sql
Test on a fresh backup database
Apply to production: psql $DATABASE_URL -f migrations/manual/...
Commit both files together


Recovery procedure if things go wrong
Backups are downloaded to your laptop:

backup_pre_week1.sql — original CucumberShowcase backup
backup_liveque_pre_consolidation.sql — pre-database-flip backup
backup_pre_schema_fix_*.sql — pre-schema.ts replacement
backup_pre_introspect_*.sql — pre-failed-introspect-attempt
backup_pre_baseline_fix_*.sql — pre-Option-C-decision

Restore procedure:

Identify which backup represents the desired state
Provision a new Neon database (or wipe affected one)
Restore: psql NEW_DATABASE_URL < backup_file.sql
Update DATABASE_URL secret in Replit projects
Restart apps


History — how we got here

Pre-2026-05-02: CucumberShowcase had its own (mostly empty) Neon database
2026-05-02 morning: Database consolidation — DATABASE_URL flipped to LiveQue's database
2026-05-02 afternoon: shared/schema.ts updated to mirror LiveQue's actual schema
2026-05-02 evening: Attempted drizzle-kit generate — produced dangerous CREATE TABLE migration (no IF NOT EXISTS)
2026-05-02 evening: Deleted dangerous migration, documented the issue
2026-05-03 morning: Attempted drizzle-kit introspect — failed due to drizzle-orm@0.39.3 missing gel-core export
2026-05-03 morning: Re-ran drizzle-kit generate — produced the same dangerous output, confirming the underlying tooling problem
2026-05-03 morning: Decided to abandon Drizzle migrations entirely (this document)