---
name: Staging DB schema drift
description: STAGING_DATABASE_URL lags the live schema; sync it with migrations/manual before running DB-backed tests.
---

The DB behind `STAGING_DATABASE_URL` is a separate, **older snapshot** than the
shared dev=prod Neon DB. It can be missing tables, columns, and the
NULL-ability/constraint changes the current code assumes. Integration tests that
boot the real routes against staging will fail with raw Postgres errors (e.g.
`null value in column "..." violates not-null`, `relation "..." does not exist`)
when staging is behind.

**Why:** schema changes ship as hand-written SQL in `migrations/manual/*.sql`
(db:push and drizzle-kit are blocked here). Those files were applied to dev/prod
but not necessarily to staging, so staging drifts.

**How to apply:** before running DB-backed tests against staging, bring its
schema forward by executing the relevant `migrations/manual/*.sql` files against
`STAGING_DATABASE_URL` (they are written idempotently — `IF NOT EXISTS`,
`DROP CONSTRAINT IF EXISTS`, `DROP NOT NULL`). Skip lines that touch tables
absent on staging and irrelevant to your feature (e.g. `loyalty_redemptions`).
Never run these against the dev/prod DB to "fix" a test — that DB is live.
Tests must seed and tear down their own rows on staging.
