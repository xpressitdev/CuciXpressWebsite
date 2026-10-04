import { expect, it } from "vitest";
import { pool } from "../server/db";

it("allows branch-level informational advances while rejecting invalid allocations", async () => {
  if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL) {
    throw new Error("Staging database required");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Copy the actual migrated CHECK constraints, not a hardcoded test schema.
    await client.query("CREATE TEMP TABLE advance_allocation_probe (LIKE pnl_expense_allocations INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP");
    await client.query(`INSERT INTO advance_allocation_probe
      (id, connecteam_expense_submission_id, branch_id, allocation_key, allocation_status, pnl_category, cents)
      VALUES (-1, -1, 1, '1', 'excluded_advance_salary', NULL, 10000)`);
    expect((await client.query("SELECT count(*)::int AS count FROM advance_allocation_probe")).rows[0].count).toBe(1);
    await expect(client.query(`INSERT INTO advance_allocation_probe
      (id, connecteam_expense_submission_id, branch_id, allocation_key, allocation_status, pnl_category, cents)
      VALUES (-2, -1, 1, '1', 'allocated', NULL, 10000)`)).rejects.toMatchObject({ code: "23514" });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});