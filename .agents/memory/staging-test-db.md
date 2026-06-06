---
name: Staging test DB & integration tests
description: How the vitest integration tests run, and the staging-schema-drift gotcha that makes them 500.
---

# Staging test DB & integration tests

Integration tests (`tests/*.test.ts`) boot the REAL Express routes via supertest
(`tests/helpers/app.ts`) against the STAGING database. `vitest.config.ts` rewires
`DATABASE_URL` -> `STAGING_DATABASE_URL` *before* app modules load, and forces
serial execution (`fileParallelism:false`, `sequence.concurrent:false`) because
the suites share one staging DB. Run with `npx vitest run`.

**Gotcha — staging schema drift:** manual SQL migrations in `migrations/manual/`
are applied to the shared dev=prod Neon DB, but STAGING is a SEPARATE database
that does NOT auto-receive them. When a route's INSERT/SELECT references a column
that exists on dev/prod but not staging, the test 500s with Postgres `42703`
"column ... does not exist" (`checkInsertTargets`), which looks like a code bug
but isn't.

**Fix:** apply the same idempotent migration file to staging before running tests.
A throwaway node one-liner works (the code_execution sandbox does NOT expose
`STAGING_DATABASE_URL`, but the bash shell does):
`node -e '...new Pool({connectionString: process.env.STAGING_DATABASE_URL}).query(fs.readFileSync(<migration>,"utf8"))...'`
All manual migrations are written idempotent (IF NOT EXISTS / ON CONFLICT), so
re-applying is safe.

**Test isolation tip:** the queue reorder route operates on EVERY queued order
for a branch with no date filter, so reorder/queue tests create their OWN
branches (and staff/sessions) rather than reusing branch 1 — otherwise stray
queued rows on the shared branch break exact-permutation assertions. Track every
seeded id and delete in afterAll.
