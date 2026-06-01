import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Express } from "express";
import { createTestApp } from "./helpers/app";

neonConfig.webSocketConstructor = ws as any;

// These tests boot the real route handlers against the STAGING database
// (vitest.config.ts rewires DATABASE_URL -> STAGING_DATABASE_URL). They
// MUST NOT run against the shared dev/prod DB.
const DB_URL = process.env.DATABASE_URL ?? "";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("Membership wash flow (QR + one-tap POS)", () => {
  let app: Express;
  let pool: Pool;

  // Seeded fixture ids / cookies.
  const suffix = rid();
  const staffId = `staff_test_${suffix}`;
  const membershipId = `mem_test_${suffix}`;
  const packMembershipId = `mempack_test_${suffix}`;
  const addonId = "addon_tire_shine";
  const plate1 = `TST${suffix.toUpperCase().slice(0, 5)}`;
  let user1Id: number;
  let customer1Id: number;
  let car1Id: number;
  let user2Id: number;
  const custSessionId = `sess_c_${suffix}`;
  const staffSessionId = `sess_s_${suffix}`;
  const cust2SessionId = `sess_c2_${suffix}`;
  const custCookie = `cx_session=${custSessionId}`;
  const staffCookie = `cx_staff_session=${staffSessionId}`;
  const cust2Cookie = `cx_session=${cust2SessionId}`;

  // Carried between ordered tests.
  let voucherOrderId: string;
  let voucherPaymentRef: string;
  let allocatedTicket: string;
  const qrFor = (ref: string) =>
    JSON.stringify({ type: "CUCI_XPRESS_PAYMENT", order_id: ref });

  beforeAll(async () => {
    if (!DB_URL || DB_URL === "") {
      throw new Error(
        "STAGING_DATABASE_URL is not set — refusing to run DB tests without a staging DB.",
      );
    }
    pool = new Pool({ connectionString: DB_URL });
    app = await createTestApp();

    // Cashier at branch 1.
    await pool.query(
      `INSERT INTO staff (id, email, name, role, branch_id, is_active, password_hash)
       VALUES ($1, $2, $3, 'cashier', 1, true, 'x')`,
      [staffId, `staff_${suffix}@test.local`, `Test Cashier ${suffix}`],
    );

    // Customer 1 (owns the Unlimited membership + a vehicle).
    const u1 = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password)
       VALUES ('Test', 'User', $1, 'x') RETURNING id`,
      [`u1_${suffix}@test.local`],
    );
    user1Id = u1.rows[0].id;
    const c1 = await pool.query(
      `INSERT INTO customers (phone, name, user_id) VALUES ($1, $2, $3) RETURNING id`,
      [`+673${suffix}`, `Cust ${suffix}`, user1Id],
    );
    customer1Id = c1.rows[0].id;
    const car1 = await pool.query(
      `INSERT INTO cars (license_plate, customer_id, user_id, last_seen_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [plate1, customer1Id, user1Id],
    );
    car1Id = car1.rows[0].id;
    await pool.query(
      `INSERT INTO memberships
         (id, customer_id, vehicle_id, total_washes, remaining_washes, price_cents,
          status, expires_at, sold_by_staff_id, sold_at_branch_id, kind)
       VALUES ($1, $2, $3, 0, 0, 5000, 'active', now() + interval '30 days', $4, 1, 'unlimited')`,
      [membershipId, customer1Id, car1Id, staffId],
    );

    // A 'pack' (multi-wash) membership on the same vehicle — used to prove the
    // packageless one-tap path rejects non-unlimited memberships.
    await pool.query(
      `INSERT INTO memberships
         (id, customer_id, vehicle_id, total_washes, remaining_washes, price_cents,
          status, expires_at, sold_by_staff_id, sold_at_branch_id, kind)
       VALUES ($1, $2, $3, 10, 10, 8000, 'active', now() + interval '30 days', $4, 1, 'pack')`,
      [packMembershipId, customer1Id, car1Id, staffId],
    );

    // Customer 2 (no membership) for the negative case.
    const u2 = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password)
       VALUES ('No', 'Member', $1, 'x') RETURNING id`,
      [`u2_${suffix}@test.local`],
    );
    user2Id = u2.rows[0].id;
    await pool.query(
      `INSERT INTO customers (phone, name, user_id) VALUES ($1, $2, $3)`,
      [`+673x${suffix}`, `NoMem ${suffix}`, user2Id],
    );

    // Auth sessions (custom Lucia adapters read auth_sessions directly).
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
       VALUES ($1, $2, 'customer', now() + interval '1 day')`,
      [custSessionId, String(user1Id)],
    );
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
       VALUES ($1, $2, 'staff', now() + interval '1 day')`,
      [staffSessionId, staffId],
    );
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
       VALUES ($1, $2, 'customer', now() + interval '1 day')`,
      [cust2SessionId, String(user2Id)],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(
        `DELETE FROM membership_redemptions WHERE membership_id = $1 OR staff_id = $2`,
        [membershipId, staffId],
      );
      await pool.query(
        `DELETE FROM orders WHERE vehicle_id = $1 OR plate = $2 OR customer_id = $3`,
        [car1Id, plate1, user1Id],
      );
      await pool.query(`DELETE FROM memberships WHERE id = ANY($1)`, [
        [membershipId, packMembershipId],
      ]);
      await pool.query(`DELETE FROM auth_sessions WHERE id = ANY($1)`, [
        [custSessionId, staffSessionId, cust2SessionId],
      ]);
      await pool.query(`DELETE FROM cars WHERE id = $1`, [car1Id]);
      await pool.query(`DELETE FROM customers WHERE user_id = ANY($1)`, [
        [user1Id, user2Id],
      ]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [
        [user1Id, user2Id],
      ]);
      await pool.query(`DELETE FROM staff WHERE id = $1`, [staffId]);
    } finally {
      await pool.end();
    }
  });

  it("rejects an unauthenticated membership check-in", async () => {
    const res = await request(app)
      .post("/api/customer/membership/checkin")
      .send({});
    expect(res.status).toBe(401);
  });

  it("creates a B$0 'Unlimited Xpress' wash order and returns a scannable QR", async () => {
    const res = await request(app)
      .post("/api/customer/membership/checkin")
      .set("Cookie", custCookie)
      .send({});

    expect([200, 201]).toContain(res.status);
    expect(res.body.ok).toBe(true);
    expect(res.body.voucher.package_name).toBe("Unlimited Xpress");
    // Validity period is surfaced from the membership's expires_at so the
    // dashboard QR card can show a real "Valid until" date.
    expect(res.body.voucher.expires_at).toBeTruthy();
    expect(Number.isNaN(Date.parse(res.body.voucher.expires_at))).toBe(false);

    const payload = JSON.parse(res.body.voucher.qr_payload);
    expect(payload.type).toBe("CUCI_XPRESS_PAYMENT");
    expect(payload.order_id).toBe(res.body.voucher.payment_ref);

    voucherOrderId = res.body.voucher.order_id;
    voucherPaymentRef = res.body.voucher.payment_ref;

    const o = await pool.query(
      `SELECT package_name, total_cents, qr_provider, status, branch_id
         FROM orders WHERE id = $1`,
      [voucherOrderId],
    );
    expect(o.rows[0].package_name).toBe("Unlimited Xpress");
    expect(Number(o.rows[0].total_cents)).toBe(0);
    expect(o.rows[0].qr_provider).toBe("membership");
    expect(o.rows[0].status).toBe("paid");
    expect(o.rows[0].branch_id).toBeNull();
  });

  it("reuses the pending order on a repeat check-in (no duplicate)", async () => {
    const res = await request(app)
      .post("/api/customer/membership/checkin")
      .set("Cookie", custCookie)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.voucher.order_id).toBe(voucherOrderId);

    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM orders
        WHERE vehicle_id = $1 AND qr_provider = 'membership'
          AND status = 'paid' AND ticket_code IS NULL`,
      [car1Id],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("lets a cashier scan the membership QR to allocate a ticket once", async () => {
    const res = await request(app)
      .post("/api/verify-qr")
      .set("Cookie", staffCookie)
      .send({ qr_data: qrFor(voucherPaymentRef), branch_id: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newly_allocated).toBe(true);
    expect(res.body.order.package_name).toBe("Unlimited Xpress");
    expect(Number(res.body.order.total_cents)).toBe(0);
    expect(res.body.order.branch_id).toBe(1);
    expect(res.body.order.ticket_code).toMatch(/^T-\d+$/);
    allocatedTicket = res.body.order.ticket_code;
  });

  it("is idempotent when the same QR is rescanned", async () => {
    const res = await request(app)
      .post("/api/verify-qr")
      .set("Cookie", staffCookie)
      .send({ qr_data: qrFor(voucherPaymentRef), branch_id: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newly_allocated).toBe(false);
    expect(res.body.order.ticket_code).toBe(allocatedTicket);
  });

  it("rejects check-in for a customer with no active unlimited membership", async () => {
    const res = await request(app)
      .post("/api/customer/membership/checkin")
      .set("Cookie", cust2Cookie)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("no_active_unlimited_membership");
  });

  it("processes a one-tap Unlimited wash at the POS as 'Unlimited Xpress' B$0", async () => {
    const res = await request(app)
      .post("/api/pos/orders")
      .set("Cookie", staffCookie)
      .send({
        package_id: null,
        plate: plate1,
        addon_ids: [],
        payment_method: "subscription",
        branch_id: 1,
        vehicle_id: car1Id,
        membership_id: membershipId,
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.order.package_name).toBe("Unlimited Xpress");
    expect(Number(res.body.order.total_cents)).toBe(0);
    expect(res.body.order.ticket_code).toMatch(/^T-\d+$/);

    const posOrder = await pool.query(
      `SELECT package_id, package_name, total_cents, payment_method, branch_id
         FROM orders WHERE id = $1`,
      [res.body.order.id],
    );
    expect(posOrder.rows[0].package_id).toBeNull();
    expect(posOrder.rows[0].package_name).toBe("Unlimited Xpress");
    expect(Number(posOrder.rows[0].total_cents)).toBe(0);
    expect(posOrder.rows[0].payment_method).toBe("subscription");
    expect(posOrder.rows[0].branch_id).toBe(1);

    const red = await pool.query(
      `SELECT id FROM membership_redemptions WHERE membership_id = $1 AND order_id = $2`,
      [membershipId, res.body.order.id],
    );
    expect(red.rows.length).toBe(1);
  });

  it("rejects a one-tap POS order with no package when not a subscription", async () => {
    const res = await request(app)
      .post("/api/pos/orders")
      .set("Cookie", staffCookie)
      .send({
        package_id: null,
        plate: plate1,
        addon_ids: [],
        payment_method: "cash",
        branch_id: 1,
        vehicle_id: car1Id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("package_required");
  });

  it("rejects a packageless unlimited wash that tries to attach paid add-ons", async () => {
    const res = await request(app)
      .post("/api/pos/orders")
      .set("Cookie", staffCookie)
      .send({
        package_id: null,
        plate: plate1,
        addon_ids: [addonId],
        payment_method: "subscription",
        branch_id: 1,
        vehicle_id: car1Id,
        membership_id: membershipId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("addons_not_allowed_on_unlimited");
  });

  it("rejects a packageless one-tap order redeeming a non-unlimited (pack) membership", async () => {
    const res = await request(app)
      .post("/api/pos/orders")
      .set("Cookie", staffCookie)
      .send({
        package_id: null,
        plate: plate1,
        addon_ids: [],
        payment_method: "subscription",
        branch_id: 1,
        vehicle_id: car1Id,
        membership_id: packMembershipId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unlimited_required");
  });

  it("rejects an unauthenticated POS order", async () => {
    const res = await request(app)
      .post("/api/pos/orders")
      .send({
        package_id: null,
        plate: plate1,
        addon_ids: [],
        payment_method: "subscription",
        branch_id: 1,
        vehicle_id: car1Id,
        membership_id: membershipId,
      });

    expect(res.status).toBe(401);
  });

  it("rejects an unauthenticated verify-qr scan", async () => {
    const res = await request(app)
      .post("/api/verify-qr")
      .send({ qr_data: qrFor(voucherPaymentRef), branch_id: 1 });

    expect(res.status).toBe(401);
  });
});
