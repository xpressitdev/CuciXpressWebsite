#!/usr/bin/env tsx
/**
 * migrate-staging.ts
 *
 * Replays every SQL file in migrations/manual/ against STAGING_DATABASE_URL,
 * then seeds the 5 branches so staging is immediately usable for testing.
 *
 * Why: production and dev currently share one Neon project. Until the staging
 * Neon project is wired up, every schema change risks corrupting prod data.
 * This script brings a fresh staging Neon project up to schema parity with
 * production, with NO customer data. From here on, every new migration is
 * applied to staging first, smoke-tested, then promoted to prod.
 *
 * Usage:
 *   tsx scripts/migrate-staging.ts          # apply all migrations + seed branches
 *   tsx scripts/migrate-staging.ts --dry    # show what would run, change nothing
 *
 * Safety:
 * - Refuses to run if STAGING_DATABASE_URL points at the same host as DATABASE_URL.
 * - Every migration is idempotent (uses IF NOT EXISTS) so re-running is safe.
 * - Logs each file applied to a tracking table `_migration_log` on staging.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

neonConfig.webSocketConstructor = ws;

const DRY_RUN = process.argv.includes("--dry");
const MIGRATIONS_DIR = join(process.cwd(), "migrations", "manual");

function fail(msg: string): never {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

function info(msg: string) {
  console.log(`\x1b[36m→\x1b[0m ${msg}`);
}

function ok(msg: string) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

const stagingUrl = process.env.STAGING_DATABASE_URL;
const prodUrl = process.env.DATABASE_URL;

if (!stagingUrl) {
  fail(
    "STAGING_DATABASE_URL is not set. Add it as a Replit Secret with the pooled connection string from your staging Neon project.",
  );
}

if (prodUrl) {
  try {
    const stagingHost = new URL(stagingUrl).hostname;
    const prodHost = new URL(prodUrl).hostname;
    // Neon connection strings differ between pooled (`-pooler`) and direct, but
    // the project segment (between `ep-` and the next `.`) is identical inside
    // a single Neon project. If both URLs share that project segment, they're
    // the same database — refuse to proceed.
    const stagingProject = stagingHost.match(/^(ep-[^.]+?)(?:-pooler)?\./)?.[1];
    const prodProject = prodHost.match(/^(ep-[^.]+?)(?:-pooler)?\./)?.[1];
    if (stagingProject && prodProject && stagingProject === prodProject) {
      fail(
        `STAGING_DATABASE_URL points at the same Neon project as DATABASE_URL (${stagingProject}). Staging must be a SEPARATE Neon project.`,
      );
    }
  } catch (e) {
    fail(`Could not parse database URLs: ${(e as Error).message}`);
  }
}

const pool = new Pool({ connectionString: stagingUrl });

async function main() {
  info(`Connecting to staging database…`);
  // Use a sticky client so SET search_path persists across all queries.
  // Neon's pooler discards role-level search_path defaults.
  const client = await pool.connect();
  await client.query(`SET search_path TO public, "$user"`);
  const ping = await client.query("SELECT current_database() AS db, version()");
  ok(`Connected: ${ping.rows[0].db}`);

  // Shadow pool with client.query for the rest of the script.
  const exec = (text: string, params?: any[]) =>
    params ? client.query(text, params) : client.query(text);

  // 1. Migration tracking table
  if (DRY_RUN) {
    info(`[dry-run] Would create _migration_log table if missing`);
  } else {
    await exec(`
      CREATE TABLE IF NOT EXISTS _migration_log (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now(),
        sha256 text NOT NULL
      )
    `);
    ok(`_migration_log ready`);
  }

  // 2. Find migration files
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    fail(`No .sql files found in ${MIGRATIONS_DIR}`);
  }

  info(`Found ${files.length} migration file(s):`);
  files.forEach((f) => console.log(`    • ${f}`));

  // 3. Apply each, in order
  for (const filename of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
    const sha = await sha256(sql);

    const already = DRY_RUN
      ? { rows: [] as any[] }
      : await exec(`SELECT sha256 FROM _migration_log WHERE filename = $1`, [filename]);

    if (already.rows.length > 0) {
      const prev = already.rows[0].sha256;
      if (prev === sha) {
        ok(`${filename} — already applied (sha matches), skipping`);
        continue;
      }
      console.warn(
        `\x1b[33m⚠\x1b[0m  ${filename} — already applied with different sha256.\n` +
          `   Previously: ${prev}\n` +
          `   Now:        ${sha}\n` +
          `   Migrations are forward-only and idempotent. If you intended to ` +
          `change a migration, write a new file instead. Re-applying anyway because the file is idempotent.`,
      );
    }

    if (DRY_RUN) {
      info(`[dry-run] Would apply ${filename} (${sql.length} bytes)`);
      continue;
    }

    info(`Applying ${filename}…`);
    try {
      await exec(sql);
      await exec(
        `INSERT INTO _migration_log (filename, sha256) VALUES ($1, $2)
         ON CONFLICT (filename) DO UPDATE SET sha256 = EXCLUDED.sha256, applied_at = now()`,
        [filename, sha],
      );
      ok(`Applied ${filename}`);
    } catch (e) {
      fail(`Failed on ${filename}: ${(e as Error).message}`);
    }
  }

  // 4. Sanity check: branches must already exist (loaded by the bootstrap
  //    step in docs/STAGING.md — pg_dump --data-only --table=branches from
  //    production). The 5 branch rows are public data (names, locations,
  //    Google Maps URLs); no PII. We do NOT seed them from this script
  //    because the columns drift over time and a wrong INSERT here is
  //    worse than a missing one.
  if (!DRY_RUN) {
    const { rows } = await exec(`SELECT count(*)::int AS n FROM branches`);
    if (rows[0].n === 0) {
      console.warn(
        `\x1b[33m⚠\x1b[0m  branches table is empty. Run the bootstrap step from docs/STAGING.md:\n` +
          `   pg_dump "$DATABASE_URL" --data-only --table=public.branches --no-owner --no-acl \\\n` +
          `     | grep -v '^\\\\restrict' | grep -v '^\\\\unrestrict' \\\n` +
          `     | psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1`,
      );
    } else {
      ok(`branches: ${rows[0].n} row(s) present`);
    }
  }

  // 5. Final summary
  if (!DRY_RUN) {
    const { rows } = await exec(`
      SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
    `);
    info(`Staging now has ${rows.length} tables:`);
    rows.forEach((r) => console.log(`    • ${r.tablename}`));
  }

  client.release();
  await pool.end();
  ok(DRY_RUN ? "Dry run complete." : "Staging is at schema parity with production.");
}

async function sha256(s: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(s).digest("hex");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
