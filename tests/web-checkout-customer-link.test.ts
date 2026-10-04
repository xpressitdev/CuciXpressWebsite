import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { createTestApp } from "./helpers/app";
import type { Express } from "express";

vi.mock("../server/payment", () => ({
  processPocketPayPayment: vi.fn(async () => ({
    success: true, transaction_id: "test-checkout", order_id: `test-${crypto.randomUUID()}`,
    payment_url: "https://example.invalid/test-payment", success_indicator: "test-only",
  })),
  handlePaymentCallback: vi.fn(),
  queryTransactionStatus: vi.fn(),
}));
vi.mock("../server/kedaipos-integration", () => ({
  kedaiPOSIntegration: { createOrder: vi.fn(async () => ({ success: false })) },
}));

neonConfig.webSocketConstructor = ws as any;

describe("web checkout customer identity mapping", () => {
  let pool: Pool;
  let app: Express;
  let userId: number;
  let pkg: { name: string; price_cents: number };
  const suffix = crypto.randomUUID().slice(0, 8);
  const plates = [0, 1, 2].map(i => `TESTCHECK${suffix}${i}`.toUpperCase());
  const phones = [0, 1, 2].map(i => `test-checkout-${suffix}-${i}`);

  beforeAll(async () => {
    if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL) {
      throw new Error("Staging database required");
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    app = await createTestApp();
    pkg = (await pool.query("SELECT name, price_cents FROM packages WHERE is_active=true LIMIT 1")).rows[0];
    userId = (await pool.query(
      "INSERT INTO users(first_name,last_name,email,password) VALUES('Checkout','Test',$1,'x') RETURNING id",
      [`checkout-${suffix}@test.local`],
    )).rows[0].id;
    // Deliberately choose a CRM ID with no matching users ID: the old code fails
    // the orders FK for both registered and guest customers in this situation.
    for (let i = 0; i < 2; i++) {
      await pool.query(
        `INSERT INTO customers(id,phone,name,user_id)
         SELECT -$1::int,$2,'Checkout fixture',$3 WHERE NOT EXISTS (SELECT 1 FROM users WHERE id=-$1::int)`,
        [userId + i, phones[i], i === 0 ? userId : null],
      );
    }
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query("DELETE FROM orders WHERE plate=ANY($1)", [plates]);
      await pool.query("DELETE FROM cars WHERE license_plate=ANY($1)", [plates]);
      await pool.query("DELETE FROM customers WHERE phone=ANY($1)", [phones]);
      if (userId) await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    } finally { await pool.end(); }
  });

  it.each([0, 1, 2])("records checkout %i before returning a payment link", async (i) => {
    const response = await request(app).post("/api/process-payment").send({
      serviceName: pkg.name, amount: pkg.price_cents / 100,
      carPlate: plates[i], phone: phones[i], email: `checkout-${suffix}@test.local`,
    });
    expect(response.status).toBe(200);
    expect(response.body.redirect_url).toBe("https://example.invalid/test-payment");
    const rows = (await pool.query(
      `SELECT o.customer_id AS order_user_id,o.status,o.vehicle_id,
              ca.customer_id AS crm_id,c.user_id AS crm_user_id
         FROM orders o JOIN cars ca ON ca.id=o.vehicle_id
         JOIN customers c ON c.id=ca.customer_id WHERE o.plate=$1`, [plates[i]],
    )).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending_payment");
    expect(rows[0].order_user_id).toBe(i === 0 ? userId : null);
    expect(rows[0].crm_user_id).toBe(i === 0 ? userId : null);
    if (i < 2) expect(rows[0].crm_id).toBe(-(userId + i));
    expect(JSON.stringify(response.body)).not.toContain("test-only");
  });
});