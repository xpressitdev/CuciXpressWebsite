---
name: Staging sandbox setup (clone prod config into staging)
description: How to build an isolated test sandbox on STAGING_DATABASE_URL by mirroring prod schema + config data, and the search_path gotcha
---

# Building a test sandbox on the staging DB

Goal: an isolated site (a forked repl pointed at STAGING_DATABASE_URL) where staff/cashiers
can test POS flows with realistic config but ZERO real customer/order data.

## Procedure that worked
1. `scripts/migrate-staging.ts` replays migrations/manual/*.sql, but some older migrations are
   NOT fully idempotent (e.g. a bare `ADD CONSTRAINT memberships_kind_valid` fails "already
   exists"). Replaying one-by-one onto a drifted staging is fragile.
2. Reliable instead: mirror prod with pg_dump (pg_dump/psql ARE in the Nix env).
   - `pg_dump "$DATABASE_URL" --no-owner --no-acl --no-comments --exclude-table-data=public.<pii_table> ... -f dump.sql`
     Exclude DATA (keep schema) for: users, cars, customers, orders, memberships, *_redemptions,
     loyalty_*, cashier_shifts, audit_log, otp_codes, auth_sessions, staff, sharepoint_outbox,
     user_achievements, collaboration_submissions, subscription_signups, service_history,
     _migration_log. KEEP data for config: branches, packages, addons_catalog, categories,
     payment_methods, payment_fee_rates, discounts, promo_codes, achievements, lanes.
   - Strip pg16's `\restrict`/`\unrestrict` lines: `grep -vE '^\\(un)?restrict '`.
   - On STAGING only: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` then
     `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f dump_clean.sql`.
   - Always confirm staging != prod first (different Neon project segment `ep-xxx`); migrate-staging
     already guards this.
3. Seed staff: `DATABASE_URL=$STAGING_DATABASE_URL STAFF_SEED_PASSWORD='<12+ chars>' tsx scripts/seed-staff.ts <email> '<name>' <role> [branch_id]`. lane/cashier are branch-locked, so give a branch_id that has packages. packages with NO package_branches rows are global (available at every branch).

## search_path gotcha (cost real debugging time)
- Staging's session default `search_path` is EMPTY (Neon pooler discards the ALTER DATABASE/ROLE
  default). In **psql** over the pooler, unqualified `select ... from branches` 500s with
  "relation does not exist", and `show search_path` is blank — DON'T panic, it's not missing data.
- The **app's @neondatabase/serverless driver** over the SAME pooler host DOES get
  `search_path=public` and unqualified queries work. So verify with the real driver, not psql.
  `options=-c search_path=public` in the URL is REJECTED by the Neon pooler ("unsupported startup
  parameter") — don't add it; it's unnecessary.

## ESM env gotcha when scripting against staging
- Setting `process.env.DATABASE_URL = process.env.STAGING_DATABASE_URL` INSIDE a .ts file does
  nothing: ES `import` of `server/db` is hoisted and reads DATABASE_URL at import time, before your
  assignment runs — you silently hit PROD. Always set the env var in the SHELL before the process:
  `DATABASE_URL="$STAGING_DATABASE_URL" tsx script.ts`.

## Fork-to-sandbox handoff (user action)
- Replit can't fork from the agent. User forks the repl, then in the fork's Secrets sets
  DATABASE_URL = the value of STAGING_DATABASE_URL, then Publishes. Fork gets its own *.replit.app
  URL and never touches prod. Other secrets (JWT_SECRET, etc.) copy over on fork.
