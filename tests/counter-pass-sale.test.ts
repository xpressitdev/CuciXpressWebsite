import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { pool } from "../server/db";
import { createTestApp } from "./helpers/app";

describe("Counter Unlimited sales: separate customer and login IDs", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const staff = `pass-test-${tag}`, session = crypto.randomUUID();
  const prefix = `P${tag.toUpperCase()}`;
  const phone = `${Date.now()}`;
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let user: number, customer: number;
  const sell = (plate: string, extra = {}) => request(app)
    .post("/api/pos/subscriptions/sell").set("Cookie", `cx_staff_session=${session}`)
    .send({ plate, branch_id: 2, payment_method: "cash", paid_amount_cents: 3900, ...extra });
  beforeAll(async () => {
    if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL)
      throw Error("Staging database required");
    app = await createTestApp();
    await pool.query("INSERT INTO staff(id,email,name,role,branch_id,is_active) VALUES($1,$2,'Pass test','cashier',2,true)", [staff, `${staff}@test.invalid`]);
    await pool.query("INSERT INTO auth_sessions(id,user_id,user_type,expires_at) VALUES($1,$2,'staff',now()+interval '1 hour')", [session, staff]);
    user = (await pool.query("INSERT INTO users(first_name,last_name,email,password) VALUES('Pass','Test',$1,'x') RETURNING id", [`${tag}@test.invalid`])).rows[0].id;
    customer = (await pool.query("INSERT INTO customers(phone,name,user_id) VALUES($1,$2,$3) RETURNING id", [phone, staff, user])).rows[0].id;
    expect(customer).not.toBe(user);
    await pool.query("INSERT INTO cars(license_plate,customer_id,user_id) VALUES($1,$2,$3)", [prefix + "E", customer, user]);
    await pool.query("INSERT INTO cars(license_plate,user_id) VALUES($1,$2)", [prefix + "U", user]);
  });
  afterAll(async () => {
    await pool.query("DELETE FROM orders WHERE staff_id=$1", [staff]);
    await pool.query("DELETE FROM memberships WHERE sold_by_staff_id=$1", [staff]);
    await pool.query("DELETE FROM cars WHERE license_plate LIKE $1", [prefix + "%"]);
    await pool.query("DELETE FROM customers WHERE name=$1", [staff]);
    await pool.query("DELETE FROM users WHERE email=$1", [`${tag}@test.invalid`]);
    await pool.query("DELETE FROM auth_sessions WHERE id=$1", [session]);
    await pool.query("DELETE FROM staff WHERE id=$1", [staff]);
  });
  it("sells to an existing account using users.id only for the order", async () => {
    const res = await sell(prefix + "E").expect(201);
    expect(res.body.membership.customer_id).toBe(customer);
    const o = (await pool.query("SELECT customer_id,total_cents,branch_id FROM orders WHERE id=$1", [res.body.order_id])).rows[0];
    expect(o).toMatchObject({ customer_id: user, total_cents: 3900, branch_id: 2 });
  });
  it("resolves a dashboard car with only user_id", async () => {
    const res = await sell(prefix + "U").expect(201);
    expect(res.body.membership.customer_id).toBe(customer);
    expect((await pool.query("SELECT customer_id FROM orders WHERE id=$1", [res.body.order_id])).rows[0].customer_id).toBe(user);
  });
  it("creates a walk-in profile and car without requiring a login", async () => {
    const res = await sell(prefix + "W", {customer_name: staff, customer_phone: phone + "1"}).expect(201);
    expect(res.body.membership.kind).toBe("unlimited");
    expect(res.body.membership.status).toBe("active");
    expect(res.body.membership.vehicle_id).toBeTruthy();
    expect((await pool.query("SELECT customer_id FROM orders WHERE id=$1", [res.body.order_id])).rows[0].customer_id).toBeNull();
    expect((await pool.query("SELECT user_id FROM customers WHERE id=$1", [res.body.membership.customer_id])).rows[0].user_id).toBeNull();
  });
  it("requires confirmation before attaching a new plate to an existing phone", async () => {
    const body = {customer_name: staff, customer_phone: phone};
    const first = await sell(prefix + "C", body).expect(409);
    expect(first.body.error).toBe("phone_belongs_to_existing_customer");
    expect((await pool.query("SELECT id FROM cars WHERE license_plate=$1", [prefix + "C"])).rowCount).toBe(0);
    const res = await sell(prefix + "C", {...body, confirm_existing_customer: true}).expect(201);
    expect(res.body.membership.customer_id).toBe(customer);
  });
  it("renews the same walk-in membership rather than creating a duplicate", async () => {
    const before = (await pool.query("SELECT m.id,m.expires_at FROM memberships m JOIN cars c ON c.id=m.vehicle_id WHERE c.license_plate=$1", [prefix + "W"])).rows[0];
    const res = await sell(prefix + "W").expect(201);
    expect(res.body.renewed).toBe(true);
    expect(res.body.membership.id).toBe(before.id);
    expect(new Date(res.body.membership.expires_at).getTime()).toBeGreaterThan(new Date(before.expires_at).getTime());
  });
  it("rejects insufficient cash without creating a sale", async () => {
    await sell(prefix + "E", {paid_amount_cents: 3800}).expect(400);
  });
});
