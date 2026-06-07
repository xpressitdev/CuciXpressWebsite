---
name: DB schema-change workflow (no Drizzle migrations)
description: How to change the DB schema — db:push is blocked; use raw SQL applied to dev AND staging
---

Schema changes do NOT go through Drizzle migration tooling. `npm run db:push`,
`drizzle-kit push/generate/migrate/introspect` are all blocked in package.json
(they error out on purpose). See MIGRATION_NOTES.md + docs/SCHEMA_CHANGES.md.

**Why:** dev=prod is one shared Neon DB with real customers and 9 tables that has
no Drizzle baseline; `generate` would emit CREATE TABLE (no IF NOT EXISTS) and
clobber/refuse against the live DB. Drizzle is used only as a typed query builder.

**How to apply a schema change:**
1. Edit `shared/schema.ts` (TypeScript types only).
2. Write idempotent raw SQL in `migrations/manual/YYYY-MM-DD_NN_desc.sql`
   (use `ADD COLUMN IF NOT EXISTS`, constant DEFAULTs so existing rows backfill).
3. Apply to dev/prod: `psql "$DATABASE_URL" -f migrations/manual/<file>.sql`.
4. Also apply to staging: `psql "$STAGING_DATABASE_URL" -f <file>.sql` — staging is
   a separate older snapshot the vitest integration tests hit, and it drifts.
5. Commit the schema.ts edit + SQL file together.

Additive nullable/defaulted columns are safe to run live. Only the relevant
INSERT paths need the new column; others rely on the column DEFAULT.
