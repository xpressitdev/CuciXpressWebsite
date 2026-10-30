import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { pool } from "../server/db";
import { registerSubscriptionRoutes } from "../server/subscriptions";
import { processPocketPayPayment } from "../server/payment";

vi.mock("../server/payment", () => ({ processPocketPayPayment: vi.fn() }));

describe("Pocket Pay pending subscription claim", () => {
  const tag = randomUUID();
  const subId = `test_${tag}`;
  const phone = `test-${tag.slice(0, 24)}`;
  let userId: number;
  let customerId: number;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).lucia = { user: { id: userId }, session: {} };
    next();
  });
  registerSubscriptionRoutes(app);
  beforeAll(async () => {
    if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL) {
      throw new Error("Staging database required");
    }
    userId = (await pool.query("INSERT INTO users(first_name,last_name,email,password) VALUES('Claim','Test',$1,'x') RETURNING id", [`${tag}@test.invalid`])).rows[0].id;
    customerId = (await pool.query("INSERT INTO customers(phone,name,user_id) VALUES($1,'Claim Test',$2) RETURNING id", [phone,userId])).rows[0].id;
    await pool.query(`INSERT INTO subscriptions(id,user_id,customer_id,plan_id,status,price_cents,currency,payment_provider,car_plate,current_period_start,current_period_end,next_billing_at)
      VALUES($1,$2,$3,'unlimited','incomplete',3900,'BND','pocket_pay',$4,now(),now(),now())`, [subId,userId,customerId,tag]);
  });
  afterAll(async () => {
    if (!userId) return;
    await pool.query("DELETE FROM subscriptions WHERE id=$1", [subId]);
    await pool.query("DELETE FROM customers WHERE id=$1", [customerId]);
    await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  });
  it("returns a pending message for a real wrapped 23505 without creating another payment", async () => {
    const response = await request(app).post("/api/subscriptions/pocketpay/start")
      .send({ plan_id: "unlimited", phone, car_plate: tag }).expect(409);
    expect(response.body.error).toBe("checkout_in_progress");
    expect(response.body.retry_after_seconds).toBeGreaterThan(0);
    expect(response.body.retry_after_seconds).toBeLessThanOrEqual(900);
    expect(processPocketPayPayment).not.toHaveBeenCalled();
    expect((await pool.query("SELECT count(*)::int n FROM subscriptions WHERE user_id=$1",[userId])).rows[0].n).toBe(1);
  });
  it("still blocks an already active subscription", async () => {
    await pool.query("UPDATE subscriptions SET status='active' WHERE id=$1", [subId]);
    const response = await request(app).post("/api/subscriptions/pocketpay/start")
      .send({ plan_id: "unlimited", phone, car_plate: tag }).expect(409);
    expect(response.body.error).toBe("already_subscribed");
    expect(processPocketPayPayment).not.toHaveBeenCalled();
  });
  it("handles an idle pool disconnect without an unhandled error event", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => pool.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow();
      expect(log).toHaveBeenCalledWith("[database.pool] idle connection failed", { code: "connection_error" });
    } finally {
      log.mockRestore();
    }
  });
});
