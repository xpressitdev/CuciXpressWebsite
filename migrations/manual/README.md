# Manual SQL Migrations

This project does **not** use `drizzle-kit push`, `generate`, `migrate`, or
`introspect`. The Neon database is shared with two other applications
(LiveQue and KedaiPOS), and any drizzle-kit command will offer destructive
prompts that can break those apps.

Instead, every schema change is a **hand-written, idempotent, forward-only
SQL file** in this folder, applied manually with `psql`, and recorded in
`docs/SCHEMA_CHANGES.md`.

The full procedure (with backup steps, testing, and verification) lives in
`docs/SCHEMA_CHANGES.md`. The rules below are the short version.

---

## Naming convention

```
YYYY-MM-DD_NN_short_slug.sql
```

- `YYYY-MM-DD` — the date the file was authored (not the date applied).
- `NN` — two-digit ordinal within that day, starting at `01`.
- `short_slug` — lowercase, underscore-separated, describing the change.

Examples:
- `2026-05-02_01_auth_and_pos_prereqs.sql`
- `2026-06-15_01_add_phone_verified.sql`
- `2026-06-15_02_add_subscription_tier_index.sql`

---

## Required properties of every migration file

1. **Idempotent.** Re-running the file must be a no-op. Use `IF NOT EXISTS`
   on every `CREATE TABLE`, `CREATE INDEX`, `ADD COLUMN`. Wrap conditional
   alters in `DO $$ ... IF NOT EXISTS ... $$` blocks.
2. **Forward-only.** No `DOWN` section. To undo a change, write a new
   migration that does the inverse.
3. **One logical change per file.** Don't bundle "add subscriptions table"
   with "drop legacy column from users". Each gets its own file.
4. **No destructive operations without explicit review.** `DROP TABLE`,
   `DROP COLUMN`, `ALTER COLUMN TYPE`, and `TRUNCATE` require a separate
   approval step (see `docs/SCHEMA_CHANGES.md` — "Dropping a table or column").
5. **Foreign keys must match the referenced column type.** The existing
   tables use `integer serial` PKs. New tables can use `text` PKs (e.g.
   nanoid), but FKs into existing tables must be `integer`. See
   `docs/SCHEMA_VERIFICATION.md` for the source of truth.

---

## How to apply

```bash
# 1. Take a backup before applying anything to production
pg_dump $DATABASE_URL --file=backup_before_$(date +%Y%m%d_%H%M).sql

# 2. (Optional but recommended) Test on a Neon branch first
psql $TEST_DATABASE_URL -f migrations/manual/2026-MM-DD_NN_<slug>.sql

# 3. Apply to production
psql $DATABASE_URL -f migrations/manual/2026-MM-DD_NN_<slug>.sql

# 4. Verify
psql $DATABASE_URL -c "\dt"
psql $DATABASE_URL -c "\d <new_table>"

# 5. Append an entry to docs/SCHEMA_CHANGES.md
```

---

## Forbidden

- `drizzle-kit push`
- `drizzle-kit generate`
- `drizzle-kit migrate`
- `drizzle-kit introspect`
- `npm run db:push`
- Editing the production database directly without first writing the
  change to a SQL file in this folder.

The reason is in `MIGRATION_NOTES.md`. The short version: drizzle-kit can
silently rewrite columns it considers "drift", and our DB has known drift
that other apps depend on.
