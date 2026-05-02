# Migration Notes — IMPORTANT

**Date:** 2026-05-02
**Author:** Hakem (with Claude assistance)

## ⚠️ DO NOT RUN db:push OR drizzle-kit generate WITHOUT READING THIS

The database for this project (CucumberShowcase / cucixpress.com) was
consolidated with CuciXpressLiveQue's database on 2026-05-02. Both apps
now share the same Neon database via DATABASE_URL.

The shared/schema.ts file was manually aligned with the existing database
schema. The database already contains all tables defined in the schema —
no further migration is needed.

## Why running db:push or drizzle-kit generate could be dangerous

- The database has 508 users, 559 cars, 5 branches, and historical data
- Drizzle's migrations folder has no baseline of LiveQue's schema history
- Running `drizzle-kit generate` may produce a "fresh database" migration
  that tries to CREATE tables that already exist (would fail)
- Running `db:push` may try to ALTER or DROP existing tables that don't
  exactly match expectations

## The right approach (TODO for next session)

1. Run `npx drizzle-kit introspect` to establish a baseline migration
   FROM the existing database state
2. Or use `drizzle-kit generate --custom` for fine-grained control
3. Verify any generated SQL is non-destructive BEFORE applying

## Backups (located in project root, also downloaded to laptop)

- backup_pre_week1.sql  — earliest snapshot
- backup_liveque_pre_consolidation.sql  — pre-DATABASE_URL flip
- backup_pre_schema_fix_*.sql  — pre-schema.ts replacement

## Recovery procedure if something goes wrong

1. Identify which backup represents the desired state
2. Drop the affected database (or create a new one)
3. Restore: psql NEW_DATABASE_URL < backup_file.sql
4. Update DATABASE_URL secret to new database
5. Restart app
