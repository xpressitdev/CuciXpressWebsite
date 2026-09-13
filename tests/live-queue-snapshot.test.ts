import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Express } from "express";
import { createTestApp } from "./helpers/app";

neonConfig.webSocketConstructor = ws as any;

// This suite uses the staging database selected by vitest.config.ts. It
// creates only disposable branch/order fixtures and never touches real orders.
const DB_URL = process.env.DATABASE_URL ?? "";
const rid = () => Math.random().toString(36).slice(2, 10);

describe("public live queue snapshot wash timing", () => {
  let app: Express;
  let pool: Pool;
  let branchId: number;
  const suffix = rid();
  const orderIds = [
    `ord_snap_w_${suffix}`,
    `ord_snap_q_${suffix}`,
    `ord_snap_pos_paid_${suffix}`,
    `ord_snap_web_unclaimed_${suffix}`,
    `ord_snap_qr_claimed_${suffix}`,
  ];

  beforeAll(async () => {
    if (!DB_URL) {
      throw new Error(
        "STAGING_DATABASE_URL is not set — refusing to run DB tests without a staging DB.",
      );
    }
    pool = new Pool({ connectionString: DB_URL });
    app = await createTestApp();
    const branch = await pool.query(
      `INSERT INTO branches
         (name, location, google_maps_url, google_maps_embed_url, review_url, is_open, status)
       VALUES ($1, 'Snapshot Test', 'http://x', 'http://x', 'http://x', true, 'open')
       RETURNING id`,
      [`Snapshot Branch ${suffix}`],
    );
    branchId = branch.rows[0].id;

    await pool.query(
      `INSERT INTO orders
         (id, branch_id, plate, package_name, package_price_cents,
           subtotal_cents, total_cents, payment_method, qr_provider, status,
           claimed_at, washing_started_at, created_at)
       VALUES
         ($1, $6, $7, 'Snapshot Wash', 800, 800, 800, 'cash', NULL, 'washing',
          NULL, now() - interval '30 seconds', now()),
         ($2, $6, $8, 'Snapshot Wash', 800, 800, 800, 'cash', NULL, 'queued',
          NULL, NULL, now()),
         ($3, $6, $9, 'Snapshot Wash', 800, 800, 800, 'cash', NULL, 'paid',
          NULL, NULL, now()),
         ($4, $6, $10, 'Snapshot Wash', 800, 800, 800, 'qr_code', 'pocket_pay', 'paid',
          NULL, NULL, now()),
         ($5, $6, $11, 'Snapshot Wash', 800, 800, 800, 'qr_code', 'pocket_pay', 'paid',
          now(), NULL, now())`,
      [
        ...orderIds,
        branchId,
        `SW${suffix}`,
        `SQ${suffix}`,
        `SP${suffix}`,
        `SU${suffix}`,
        `SC${suffix}`,
      ],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(`DELETE FROM orders WHERE id = ANY($1)`, [orderIds]);
      await pool.query(`DELETE FROM branches WHERE id = $1`, [branchId]);
    } finally {
      await pool.end();
    }
  });

  const branchSnapshot = async () => {
    const response = await request(app).get("/api/queue/snapshot");
    expect(response.status).toBe(200);
    const found = response.body.branches.find((b: any) => b.id === branchId);
    expect(found).toBeTruthy();
    return found;
  };

  it("includes paid POS and claimed QR rows, not an unclaimed web payment", async () => {
    const branch = await branchSnapshot();
    expect(branch.washing_count).toBe(1);
    expect(branch.queued_count).toBe(3);
    expect(branch.queued.map((o: any) => o.plate)).toEqual(
      expect.arrayContaining([`SQ${suffix}`, `SP${suffix}`, `SC${suffix}`]),
    );
    expect(branch.queued.map((o: any) => o.plate)).not.toContain(`SU${suffix}`);
  });

  it("includes the start timestamp and active wash time in the estimate", async () => {
    const branch = await branchSnapshot();
    expect(branch.washing_count).toBe(1);
    expect(branch.washing[0].washing_started_at).toBeTruthy();
    // About 7.5 minutes remain, then three single-lane queued cars take 24m.
    expect(branch.est_wait_seconds).toBeGreaterThan(1860);
    expect(branch.est_wait_seconds).toBeLessThanOrEqual(1900);
    expect(branch.est_wait_minutes).toBeGreaterThanOrEqual(31);
  });

  it("reduces the estimate as the active wash ages", async () => {
    await pool.query(
      `UPDATE orders SET washing_started_at = now() - interval '120 seconds'
        WHERE id = $1`,
      [orderIds[0]],
    );
    const branch = await branchSnapshot();
    // Roughly six minutes remain plus 24 minutes for the queued cars.
    expect(branch.est_wait_seconds).toBeGreaterThan(1750);
    expect(branch.est_wait_seconds).toBeLessThan(1850);
  });

  it("keeps an overdue active wash occupied instead of reporting Open", async () => {
    await pool.query(`DELETE FROM orders WHERE id = ANY($1)`, [orderIds.slice(1)]);
    await pool.query(
      `UPDATE orders SET washing_started_at = now() - interval '10 minutes'
        WHERE id = $1`,
      [orderIds[0]],
    );
    const branch = await branchSnapshot();
    expect(branch.washing_count).toBe(1);
    expect(branch.queued_count).toBe(0);
    expect(branch.est_wait_seconds).toBe(0);
    expect(branch.washing[0].washing_started_at).toBeTruthy();
  });

  it("does not invent a start for a legacy washing row", async () => {
    await pool.query(
      `UPDATE orders SET washing_started_at = NULL WHERE id = $1`,
      [orderIds[0]],
    );
    const branch = await branchSnapshot();
    expect(branch.washing_count).toBe(1);
    expect(branch.est_wait_seconds).toBeNull();
    expect(branch.est_wait_minutes).toBeNull();
    expect(branch.washing[0].washing_started_at).toBeNull();
  });
});