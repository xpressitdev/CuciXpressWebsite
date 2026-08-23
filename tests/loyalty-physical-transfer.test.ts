import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Express } from "express";
import { createTestApp } from "./helpers/app";

neonConfig.webSocketConstructor = ws as any;

const DB_URL = process.env.DATABASE_URL ?? "";
const rid = () => Math.random().toString(36).slice(2, 10);
const LOYALTY_PKG_ID = "pkg_basic_tyre_wax";

describe("physical-card loyalty transfers", () => {
  let app: Express;
  let pool: Pool;

  const suffix = rid();
  const ownerId = `staff_lpt_o_${suffix}`;
  const cashier1Id = `staff_lpt_c1_${suffix}`;
  const cashier2Id = `staff_lpt_c2_${suffix}`;
  const ownerSession = `sess_lpt_o_${suffix}`;
  const cashier1Session = `sess_lpt_c1_${suffix}`;
  const cashier2Session = `sess_lpt_c2_${suffix}`;
  const customerSession = `sess_lpt_u_${suffix}`;
  const ownerCookie = `cx_staff_session=${ownerSession}`;
  const cashier1Cookie = `cx_staff_session=${cashier1Session}`;
  const cashier2Cookie = `cx_staff_session=${cashier2Session}`;
  const customerCookie = `cx_session=${customerSession}`;
  const plate = `LPT${suffix.toUpperCase().slice(0, 5)}`;
  const otherPlate = `LPX${suffix.toUpperCase().slice(0, 5)}`;
  const orderIds: string[] = [];
  const membershipId = `mem_lpt_${suffix}`;
  let userId: number;
  let customerId: number;
  let carId: number;
  let otherCarId: number;

  async function seedOrder(
    overrides: Partial<{
      branchId: number;
      packageId: string;
      totalCents: number;
      paymentMethod: string;
      qrProvider: string | null;
      status: string;
    }> = {},
  ) {
    const id = `ord_lpt_${rid()}`;
    orderIds.push(id);
    const branchId = overrides.branchId ?? 1;
    const packageId = overrides.packageId ?? LOYALTY_PKG_ID;
    const totalCents = overrides.totalCents ?? 1200;
    const paymentMethod = overrides.paymentMethod ?? "cash";
    const qrProvider = overrides.qrProvider ?? null;
    const status = overrides.status ?? "done";
    const insertStatus = status === "refunded" ? "done" : status;
    await pool.query(
      `INSERT INTO orders
         (id, branch_id, customer_id, vehicle_id, plate,
          package_id, package_name, package_price_cents,
          addons, subtotal_cents, total_cents, paid_amount_cents,
          payment_method, qr_provider, ticket_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, '$12 Full Package', 1200,
               '[]'::jsonb, $7, $7, $7, $8, $9, $10, $11)`,
      [
        id,
        branchId,
        userId,
        carId,
        plate,
        packageId,
        totalCents,
        paymentMethod,
        qrProvider,
        `T-${id.slice(-5)}`,
        insertStatus,
      ],
    );
    if (status === "refunded") {
      await pool.query(
        `UPDATE orders
            SET status = 'refunded', refunded_at = now(),
                refunded_by_staff_id = $2, refund_reason = 'test refund'
          WHERE id = $1`,
        [id, ownerId],
      );
    }
    return id;
  }

  async function dashboardStamps() {
    const response = await request(app)
      .get("/api/customer/loyalty")
      .set("Cookie", customerCookie);
    expect(response.status).toBe(200);
    const card = response.body.cards.find((row: any) => row.vehicle_id === carId);
    expect(card).toBeTruthy();
    return card.raw_stamps as number;
  }

  async function lookup(cookie = cashier1Cookie) {
    return request(app)
      .get(`/api/pos/loyalty/lookup?plate=${encodeURIComponent(plate)}`)
      .set("Cookie", cookie);
  }

  beforeAll(async () => {
    if (!DB_URL) {
      throw new Error(
        "STAGING_DATABASE_URL is not set — refusing to run DB tests without a staging DB.",
      );
    }
    pool = new Pool({ connectionString: DB_URL });
    app = await createTestApp();

    await pool.query(
      `INSERT INTO staff (id, email, name, role, branch_id, is_active, password_hash)
       VALUES ($1, $2, 'LPT Owner', 'owner', NULL, true, 'x'),
              ($3, $4, 'LPT Cashier 1', 'cashier', 1, true, 'x'),
              ($5, $6, 'LPT Cashier 2', 'cashier', 2, true, 'x')`,
      [
        ownerId,
        `lpt_o_${suffix}@test.local`,
        cashier1Id,
        `lpt_c1_${suffix}@test.local`,
        cashier2Id,
        `lpt_c2_${suffix}@test.local`,
      ],
    );
    const user = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password)
       VALUES ('Loyalty', 'Transfer', $1, 'x') RETURNING id`,
      [`lpt_${suffix}@test.local`],
    );
    userId = user.rows[0].id;
    const customer = await pool.query(
      `INSERT INTO customers (phone, name, user_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [`+673lpt${suffix}`, `LPT ${suffix}`, userId],
    );
    customerId = customer.rows[0].id;
    const car = await pool.query(
      `INSERT INTO cars (license_plate, customer_id, user_id, last_seen_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [plate, customerId, userId],
    );
    carId = car.rows[0].id;
    const otherCar = await pool.query(
      `INSERT INTO cars (license_plate, last_seen_at)
       VALUES ($1, now()) RETURNING id`,
      [otherPlate],
    );
    otherCarId = otherCar.rows[0].id;
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
       VALUES ($1, $2, 'staff', now() + interval '1 day'),
              ($3, $4, 'staff', now() + interval '1 day'),
              ($5, $6, 'staff', now() + interval '1 day'),
              ($7, $8, 'customer', now() + interval '1 day')`,
      [
        ownerSession,
        ownerId,
        cashier1Session,
        cashier1Id,
        cashier2Session,
        cashier2Id,
        customerSession,
        String(userId),
      ],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(
        `DELETE FROM loyalty_physical_card_transfers WHERE order_id = ANY($1)`,
        [orderIds],
      );
      await pool.query(
        `DELETE FROM loyalty_manual_stamps
          WHERE vehicle_id IN ($1, $2)
             OR plate_norm IN ($3, $4)`,
        [carId, otherCarId, plate.toUpperCase(), otherPlate.toUpperCase()],
      );
      await pool.query(
        `DELETE FROM loyalty_redemptions
          WHERE voucher_order_id IN (SELECT id FROM orders WHERE vehicle_id = $1)`,
        [carId],
      );
      await pool.query(
        `DELETE FROM membership_redemptions WHERE membership_id = $1`,
        [membershipId],
      );
      await pool.query(`DELETE FROM memberships WHERE id = $1`, [membershipId]);
      await pool.query(`DELETE FROM orders WHERE id = ANY($1)`, [orderIds]);
      await pool.query(`DELETE FROM auth_sessions WHERE id = ANY($1)`, [
        [ownerSession, cashier1Session, cashier2Session, customerSession],
      ]);
      await pool.query(`DELETE FROM cars WHERE id = $1`, [carId]);
      await pool.query(`DELETE FROM cars WHERE id = $1`, [otherCarId]);
      await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await pool.query(`DELETE FROM staff WHERE id = ANY($1)`, [
        [ownerId, cashier1Id, cashier2Id],
      ]);
    } finally {
      await pool.end();
    }
  });

  it("lists each digital wash with receipt details", async () => {
    for (let i = 0; i < 4; i += 1) await seedOrder();
    const response = await lookup();
    expect(response.status).toBe(200);
    expect(response.body.auto_stamps).toBe(4);
    expect(response.body.eligible_orders).toHaveLength(4);
    expect(response.body.eligible_orders[0]).toMatchObject({
      loyalty_status: "digital",
      branch_name: expect.any(String),
      receipt_reference: expect.any(String),
      paid_amount_cents: 1200,
      can_transfer: true,
    });
  });

  it("atomically moves one wash and prevents a double transfer", async () => {
    const orderId = orderIds[0];
    const [first, second] = await Promise.all([
      request(app)
        .post("/api/pos/loyalty/physical-transfer")
        .set("Cookie", cashier1Cookie)
        .send({ order_id: orderId, note: "paper receipt stamped" }),
      request(app)
        .post("/api/pos/loyalty/physical-transfer")
        .set("Cookie", cashier1Cookie)
        .send({ order_id: orderId, physical_card_reference: "CARD-TEST" }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await dashboardStamps()).toBe(3);

    const rows = await pool.query(
      `SELECT * FROM loyalty_physical_card_transfers
        WHERE order_id = $1 AND reversed_at IS NULL`,
      [orderId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].transferred_by_staff_id).toBe(cashier1Id);
  });

  it("cannot digitally redeem a transferred wash", async () => {
    const response = await request(app)
      .post("/api/customer/loyalty/redeem")
      .set("Cookie", customerCookie)
      .send({ plate });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "not_enough_stamps",
      have: 3,
      need: 4,
    });
  });

  it("owner reversal restores the digital stamp and keeps audit history", async () => {
    const transfer = await pool.query(
      `SELECT id FROM loyalty_physical_card_transfers
        WHERE order_id = $1 AND reversed_at IS NULL`,
      [orderIds[0]],
    );
    const response = await request(app)
      .post(
        `/api/pos/loyalty/physical-transfer/${transfer.rows[0].id}/reverse`,
      )
      .set("Cookie", ownerCookie)
      .send({ note: "wrong receipt" });
    expect(response.status).toBe(200);
    expect(await dashboardStamps()).toBe(4);

    const audit = await pool.query(
      `SELECT reversed_at, reversed_by_staff_id, reversal_note
         FROM loyalty_physical_card_transfers WHERE id = $1`,
      [transfer.rows[0].id],
    );
    expect(audit.rows[0].reversed_at).toBeTruthy();
    expect(audit.rows[0].reversed_by_staff_id).toBe(ownerId);
    expect(audit.rows[0].reversal_note).toBe("wrong receipt");
  });

  it("does not reverse a physical entry after it is marked used", async () => {
    const moved = await request(app)
      .post("/api/pos/loyalty/physical-transfer")
      .set("Cookie", ownerCookie)
      .send({ order_id: orderIds[0], note: "second verified move" });
    expect(moved.status).toBe(201);
    const used = await request(app)
      .post(`/api/pos/loyalty/physical-transfer/${moved.body.transfer_id}/use`)
      .set("Cookie", ownerCookie)
      .send({});
    expect(used.status).toBe(200);
    const reversed = await request(app)
      .post(
        `/api/pos/loyalty/physical-transfer/${moved.body.transfer_id}/reverse`,
      )
      .set("Cookie", ownerCookie)
      .send({ note: "too late" });
    expect(reversed.status).toBe(409);
    expect(reversed.body.error).toBe("already_used");
    expect(await dashboardStamps()).toBe(3);

    // Keep later assertions independent while preserving this row until teardown.
    await pool.query(
      `UPDATE loyalty_physical_card_transfers
          SET used_at = NULL, used_by_staff_id = NULL,
              reversed_at = now(), reversed_by_staff_id = $2,
              reversal_note = 'test reset'
        WHERE id = $1`,
      [moved.body.transfer_id, ownerId],
    );
  });

  it("rejects refunded, voided, free, voucher, and membership washes", async () => {
    const refunded = await seedOrder({ status: "refunded" });
    const voided = await seedOrder({ status: "voided" });
    const free = await seedOrder({ totalCents: 0 });
    const voucher = await seedOrder({
      totalCents: 0,
      paymentMethod: "voucher",
      qrProvider: "loyalty",
    });
    const membershipOrder = await seedOrder();
    await pool.query(
      `INSERT INTO memberships
         (id, customer_id, vehicle_id, total_washes, remaining_washes,
          price_cents, status)
       VALUES ($1, $2, $3, 1, 0, 1200, 'exhausted')`,
      [membershipId, customerId, carId],
    );
    await pool.query(
      `INSERT INTO membership_redemptions
         (id, membership_id, order_id, staff_id)
       VALUES ($1, $2, $3, $4)`,
      [`mr_lpt_${suffix}`, membershipId, membershipOrder, cashier1Id],
    );

    for (const orderId of [refunded, voided, free, voucher, membershipOrder]) {
      const response = await request(app)
        .post("/api/pos/loyalty/physical-transfer")
        .set("Cookie", ownerCookie)
        .send({ order_id: orderId, note: "should fail" });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe("order_not_eligible");
    }
  });

  it("keeps discounted B$12-package sales eligible", async () => {
    const discounted = await seedOrder({ totalCents: 900 });
    const response = await request(app)
      .post("/api/pos/loyalty/physical-transfer")
      .set("Cookie", ownerCookie)
      .send({ order_id: discounted, note: "BruHealth receipt" });
    expect(response.status).toBe(201);
  });

  it("locks cashiers to the original wash branch", async () => {
    const branch2Order = await seedOrder({ branchId: 2 });
    const wrongBranch = await request(app)
      .post("/api/pos/loyalty/physical-transfer")
      .set("Cookie", cashier1Cookie)
      .send({ order_id: branch2Order, note: "wrong branch" });
    expect(wrongBranch.status).toBe(403);
    expect(wrongBranch.body.error).toBe("other_branch");

    const originalBranch = await request(app)
      .post("/api/pos/loyalty/physical-transfer")
      .set("Cookie", cashier2Cookie)
      .send({ order_id: branch2Order, note: "receipt seen here" });
    expect(originalBranch.status).toBe(201);
  });

  it("does not let a manual stamp duplicate a matching system receipt", async () => {
    const order = await pool.query(
      `SELECT ticket_code FROM orders WHERE id = $1`,
      [orderIds[1]],
    );
    const response = await request(app)
      .post("/api/pos/loyalty/stamp")
      .set("Cookie", cashier1Cookie)
      .send({
        plate,
        count: 1,
        receipt_no: order.rows[0].ticket_code,
        note: "duplicate attempt",
      });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("matching_digital_order");
  });

  it("does not let a manual stamp move a system receipt to another plate", async () => {
    const order = await pool.query(
      `SELECT ticket_code FROM orders WHERE id = $1`,
      [orderIds[2]],
    );
    const response = await request(app)
      .post("/api/pos/loyalty/stamp")
      .set("Cookie", cashier1Cookie)
      .send({
        plate: otherPlate,
        count: 1,
        receipt_no: order.rows[0].ticket_code,
        note: "cross-plate duplicate attempt",
      });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("matching_digital_order");
    const manual = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM loyalty_manual_stamps
        WHERE vehicle_id = $1`,
      [otherCarId],
    );
    expect(manual.rows[0].n).toBe(0);
  });

  it("serializes case-insensitive duplicate historic receipt credits", async () => {
    const historicReceipt = `HIST-${suffix}`;
    const [first, second] = await Promise.all([
      request(app)
        .post("/api/pos/loyalty/stamp")
        .set("Cookie", cashier1Cookie)
        .send({
          plate,
          count: 1,
          receipt_no: `  ${historicReceipt.toLowerCase()}  `,
          note: "historic paper receipt",
        }),
      request(app)
        .post("/api/pos/loyalty/stamp")
        .set("Cookie", cashier1Cookie)
        .send({
          plate,
          count: 1,
          receipt_no: historicReceipt,
          note: "same receipt again",
        }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const credits = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM loyalty_manual_stamps
        WHERE vehicle_id = $1
          AND UPPER(BTRIM(receipt_no)) = UPPER($2)`,
      [carId, historicReceipt],
    );
    expect(credits.rows[0].n).toBe(1);
  });

  it("rejects a sequential historic receipt credit on another plate", async () => {
    const historicReceipt = `SEQ-${suffix}`;
    const first = await request(app)
      .post("/api/pos/loyalty/stamp")
      .set("Cookie", cashier1Cookie)
      .send({
        plate,
        count: 1,
        receipt_no: historicReceipt,
        note: "first historic credit",
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/pos/loyalty/stamp")
      .set("Cookie", cashier1Cookie)
      .send({
        plate: otherPlate,
        count: 1,
        receipt_no: historicReceipt.toLowerCase(),
        note: "cross-plate repeat",
      });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("receipt_already_credited");
  });

  it("serializes concurrent cross-plate historic receipt credits", async () => {
    const historicReceipt = `CON-${suffix}`;
    const [first, second] = await Promise.all([
      request(app)
        .post("/api/pos/loyalty/stamp")
        .set("Cookie", cashier1Cookie)
        .send({
          plate,
          count: 1,
          receipt_no: historicReceipt,
          note: "plate one",
        }),
      request(app)
        .post("/api/pos/loyalty/stamp")
        .set("Cookie", cashier1Cookie)
        .send({
          plate: otherPlate,
          count: 1,
          receipt_no: ` ${historicReceipt.toLowerCase()} `,
          note: "plate two",
        }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const credits = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM loyalty_manual_stamps
        WHERE UPPER(BTRIM(receipt_no)) = UPPER($1)`,
      [historicReceipt],
    );
    expect(credits.rows[0].n).toBe(1);
  });
});