# Staging environment

This project uses **two separate Neon Postgres projects**:

| Environment | Owner | Connection secret | Used by |
|---|---|---|---|
| Production / Dev (shared) | Replit-provisioned Neon | `DATABASE_URL` | the running app on cucixpress.com AND the Replit dev workspace |
| Staging | Owner's personal Neon account | `STAGING_DATABASE_URL` | manual schema testing only — no app traffic |

> **Why "Production / Dev (shared)"?** The Replit-provisioned Neon project
> currently serves both the dev workspace and the deployed cucixpress.com app.
> Splitting those is a separate piece of work; for now, "Production" and "Dev"
> mean the same Neon database. Staging is what gives us a safe place to test
> schema changes before they touch real customer data.

## What staging is for

Staging exists for **one reason only**: to test SQL migrations before they run
against the production database. It is not a hosted environment, has no app
deployed against it, and contains no customer data — just the schema and the 5
branch rows.

The flow for every schema change is:

```
1. Write a new migration file in migrations/manual/
   ↓
2. Apply it to staging:    tsx scripts/migrate-staging.ts
   ↓
3. Verify on staging       (psql $STAGING_DATABASE_URL)
   ↓
4. Apply to production:    psql $DATABASE_URL -f migrations/manual/<file>
   ↓
5. Append entry to docs/SCHEMA_CHANGES.md
```

If step 2 fails, you fix the migration file and try again — production never
sees a broken migration.

## One-time setup

1. Create a free Neon account at https://neon.tech (any email; can be different
   from the Replit account).
2. Create a project named `cucixpress-staging`, Postgres 16, region
   `AWS US East (N. Virginia)` (same as production).
3. Copy the **pooled** connection string. It must include `?sslmode=require`.
4. Add it as a Replit Secret named `STAGING_DATABASE_URL`.
5. Bring staging to schema parity with production:
   ```bash
   tsx scripts/migrate-staging.ts
   ```

The script:
- Refuses to run if `STAGING_DATABASE_URL` points at the same Neon project as
  `DATABASE_URL` (safety check).
- Creates a `_migration_log` tracking table on staging.
- Replays every file in `migrations/manual/` in filename order, idempotently.
- Seeds the 5 branch rows.
- Prints the resulting table list.

To preview without applying anything: `tsx scripts/migrate-staging.ts --dry`

## Day-to-day: applying a new migration

```bash
# 1. Write the migration (see migrations/manual/README.md for the rules)
$EDITOR migrations/manual/2026-MM-DD_NN_short_slug.sql

# 2. Apply to staging
tsx scripts/migrate-staging.ts

# 3. Verify on staging
psql $STAGING_DATABASE_URL -c "\d <new_or_changed_table>"

# 4. Take a backup of production (skill-level safety)
pg_dump $DATABASE_URL --file=backup_before_$(date +%Y%m%d_%H%M).sql

# 5. Apply to production
psql $DATABASE_URL -f migrations/manual/2026-MM-DD_NN_short_slug.sql

# 6. Verify on production
psql $DATABASE_URL -c "\d <new_or_changed_table>"

# 7. Record the change in docs/SCHEMA_CHANGES.md
```

## What staging is NOT

- **Not a deployed app.** No Replit workflow points at it. It's a database, not
  an environment with a running server.
- **Not a customer data clone.** It has 5 branch rows and that's it. If you
  need realistic test data, seed it yourself with a script — never copy
  production rows over (PII, OTP secrets, session cookies, audit history).
- **Not a backup.** Production backups belong in `pg_dump` files, not staging.

## When staging diverges from production

If staging and production drift (someone applied a file to one but not the
other), the right fix is **always** to bring both to the same state by writing
forward-only migrations. Never run `DROP` to "reset" staging back to prod —
that risks the destructive paths the team has explicitly forbidden.

To reset staging from scratch (only valid because staging has no real data):

1. In the Neon console for `cucixpress-staging`, delete the project.
2. Create a new project with the same name and region.
3. Update the `STAGING_DATABASE_URL` secret with the new connection string.
4. Run `tsx scripts/migrate-staging.ts`.

## Common errors

**`STAGING_DATABASE_URL points at the same Neon project as DATABASE_URL`**
You pasted the production connection string by mistake. Get the one from your
personal Neon account's `cucixpress-staging` project.

**`relation "X" already exists`**
A migration file isn't idempotent. Fix it (use `IF NOT EXISTS`) and re-run.
The `_migration_log` table tracks what's been applied so re-runs are safe.

**`permission denied for relation X`**
The pooled connection string may have a role without DDL privileges. In Neon,
use the connection string for the `neondb_owner` role.
