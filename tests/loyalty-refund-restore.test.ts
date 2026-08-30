import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Express } from "express";
import { createTestApp } from "./helpers/app";

neonConfig.webSocketConstructor = ws as any;

// Boots the real route handlers against the STAGING database
// (vitest.config.ts rewires DATABASE_URL -> STAGING_DATABASE_URL).
const DB_URL = process.env.DATABASE_URL ?? "";

const rid = () => Math.random().toString(36).slice(2, 10);

const LOYALTY_PKG_ID = "pkg_basic_tyre_wax";
const REQUIRED = 4;

describe("Refunding a free-wash voucher restores the loyalty stamps", () => {
  let app: Express;
  let pool: Pool;

  const suffix = rid();
  const cashierId = `staff_lrt_c_${suffix}`;
  const managerId = `staff_lrt_m_${suffix}`;
  const plate = `LRT${suffix.toUpperCase().slice(0, 5)}`;
  let userId: number;
  let customerId: number;
  let carId: number;
  const custSessionId = `sess_lrt_cu_${suffix}`;
  const cashierSessionId = `sess_lrt_ca_${suffix}`;
  const managerSessionId = `sess_lrt_mg_${suffix}`;
  const custCookie = `cx_session=${custSessionId}`;
  const cashierCookie = `cx_staff_session=${cashierSessionId}`;
  const managerCookie = `cx_staff_session=${managerSessionId}`;

  const orderIds: string[] = [];
  const manualStampId = `lms_test_${suffix}`;

  // Carried between ordered tests.
  let voucherOrderId: string;
  let voucherPaymentRef: string;

  const qrFor = (ref: string) =>
    JSON.stringify({ type: "CUCI_XPRESS_PAYMENT", order_id: ref });

  // Sum of stamps the customer's dashboard shows for the test car.
  async function dashboardStamps(): Promise<{
    stamps: number;
    can_redeem: boolean;
    pending: any;
  }> {
    const res = await request(app)
      .get("/api/customer/loyalty")
      .set("Cookie", custCookie);
    expect(res.status).toBe(200);
    const card = res.body.cards.find((c: any) => c.vehicle_id === carId);
    expect(card).toBeTruthy();
    return {
      stamps: card.stamps,
      can_redeem: card.can_redeem,
      pending: card.pending_voucher,
    };
  }

  // Insert one eligible B$12 order for the test car.
  async function seedEligibleOrder(): Promise<string> {
    const id = `ord_lrt_${rid()}`;
    orderIds.push(id);
    await pool.query(
      `INSERT INTO orders
         (id, branch_id, customer_id, vehicle_id, plate,
          package_id, package_name, package_price_cents,
          addons, subtotal_cents, total_cents,
          payment_method, status)
       VALUES ($1, 1, $2, $3, $4, $5, '$12 Full Package', 1200,
               '[]'::jsonb, 1200, 1200, 'cash', 'done')`,
      [id, userId, carId, plate, LOYALTY_PKG_ID],
    );
    return id;
  }

  beforeAll(async () => {
    if (!DB_URL) {
      throw new Error(
        "STAGING_DATABASE_URL is not set — refusing to run DB tests without a staging DB.",
      );
    }
    pool = new Pool({ connectionString: DB_URL });
    app = await createTestApp();

    // Cashier (branch 1) + manager (branchless refunds).
    await pool.query(
      `INSERT INTO staff (id, email, name, role, branch_id, is_active, password_hash)
       VALUES ($1, $2, $3, 'cashier', 1, true, 'x'),
              ($4, $5, $6, 'manager', NULL, true, 'x')`,
      [
        cashierId,
        `lrt_c_${suffix}@test.local`,
        `LRT Cashier ${suffix}`,
        managerId,
        `lrt_m_${suffix}@test.local`,
        `LRT Manager ${suffix}`,
      ],
    );

    const u = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password)
       VALUES ('Loyal', 'Refund', $1, 'x') RETURNING id`,
      [`lrt_${suffix}@test.local`],
    );
    userId = u.rows[0].id;
    const c = await pool.query(
      `INSERT INTO customers (phone, name, user_id) VALUES ($1, $2, $3) RETURNING id`,
      [`+673lrt${suffix}`, `LRT Cust ${suffix}`, userId],
    );
    customerId = c.rows[0].id;
    const car = await pool.query(
      `INSERT INTO cars (license_plate, customer_id, user_id, last_seen_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [plate, customerId, userId],
    );
    carId = car.rows[0].id;

    // Mixed earning: 2 real B$12 orders + 2 cashier manual stamps = 4/4.
    await seedEligibleOrder();
    await seedEligibleOrder();
    await pool.query(
      `INSERT INTO loyalty_manual_stamps
         (id, vehicle_id, plate, plate_norm, stamps_total, stamps_remaining,
          note, branch_id, staff_id)
       VALUES ($1, $2, $3, $4, 2, 2, 'test seed', 1, $5)`,
      [manualStampId, carId, plate, plate.toUpperCase(), cashierId],
    );

    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
       VALUES ($1, $2, 'customer', now() + interval '1 day'),
              ($3, $4, 'staff', now() + interval '1 day'),
              ($5, $6, 'staff', now() + interval '1 day')`,
      [
        custSessionId,
        String(userId),
        cashierSessionId,
        cashierId,
        managerSessionId,
        managerId,
      ],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(
        `UPDATE orders
            SET loyalty_consumed_in = NULL
          WHERE vehicle_id = $1 OR plate = $2`,
        [carId, plate],
      );
      await pool.query(
        `DELETE FROM loyalty_redemptions
          WHERE customer_user_id = $1
             OR voucher_order_id IN (SELECT id FROM orders WHERE vehicle_id = $2)`,
        [userId, carId],
      );
      await pool.query(
        `DELETE FROM loyalty_manual_stamps WHERE vehicle_id = $1 OR plate_norm = $2`,
        [carId, plate.toUpperCase()],
      );
      await pool.query(`DELETE FROM orders WHERE vehicle_id = $1 OR plate = $2`, [
        carId,
        plate,
      ]);
      await pool.query(`DELETE FROM auth_sessions WHERE id = ANY($1)`, [
        [custSessionId, cashierSessionId, managerSessionId],
      ]);
      await pool.query(`DELETE FROM cars WHERE id = $1`, [carId]);
      await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await pool.query(`DELETE FROM staff WHERE id = ANY($1)`, [
        [cashierId, managerId],
      ]);
    } finally {
      await pool.end();
    }
  });

  it("shows 4/4 stamps from 2 orders + 2 manual credits", async () => {
    const d = await dashboardStamps();
    expect(d.stamps).toBe(REQUIRED);
    expect(d.can_redeem).toBe(true);
    expect(d.pending).toBeNull();
  });

  it("redeems the mixed stamps into a free-wash voucher", async () => {
    const res = await request(app)
      .post("/api/customer/loyalty/redeem")
      .set("Cookie", custCookie)
      .send({ plate });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    voucherOrderId = res.body.voucher.order_id;
    voucherPaymentRef = res.body.voucher.payment_ref;

    // 2 real orders punched, manual pot drained to 0.
    const punched = await pool.query(
      `SELECT COUNT(*)::int AS n FROM orders
        WHERE id = ANY($1) AND loyalty_consumed_in = $2`,
      [orderIds, voucherPaymentRef],
    );
    expect(punched.rows[0].n).toBe(2);
    const manual = await pool.query(
      `SELECT COALESCE(SUM(stamps_remaining),0)::int AS n
         FROM loyalty_manual_stamps
        WHERE vehicle_id = $1 OR plate_norm = $2`,
      [carId, plate.toUpperCase()],
    );
    expect(manual.rows[0].n).toBe(0);

    const d = await dashboardStamps();
    expect(d.stamps).toBe(0);
    expect(d.pending?.order_id).toBe(voucherOrderId);
  });

  it("lets the cashier scan the voucher QR (stamps branch on the order)", async () => {
    const res = await request(app)
      .post("/api/verify-qr")
      .set("Cookie", cashierCookie)
      .send({ qr_data: qrFor(voucherPaymentRef), branch_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order.branch_id).toBe(1);
  });

  it("refund restores the stamps: dashboard back to 4/4", async () => {
    const res = await request(app)
      .post(`/api/pos/orders/${voucherOrderId}/refund`)
      .set("Cookie", cashierCookie)
      .send({ reason: "mis-scan" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.order.status).toBe("refunded");

    // Un-punched the 2 real orders.
    const punched = await pool.query(
      `SELECT COUNT(*)::int AS n FROM orders
        WHERE id = ANY($1) AND loyalty_consumed_in IS NOT NULL`,
      [orderIds],
    );
    expect(punched.rows[0].n).toBe(0);

    // Re-credited exactly the 2 manual stamps as a fresh audit row.
    const manual = await pool.query(
      `SELECT COALESCE(SUM(stamps_remaining),0)::int AS n
         FROM loyalty_manual_stamps
        WHERE vehicle_id = $1 OR plate_norm = $2`,
      [carId, plate.toUpperCase()],
    );
    expect(manual.rows[0].n).toBe(2);

    // Redemption row deleted.
    const red = await pool.query(
      `SELECT COUNT(*)::int AS n FROM loyalty_redemptions WHERE voucher_order_id = $1`,
      [voucherOrderId],
    );
    expect(red.rows[0].n).toBe(0);

    const d = await dashboardStamps();
    expect(d.stamps).toBe(REQUIRED);
    expect(d.can_redeem).toBe(true);
    // Refunded voucher no longer shows as pending.
    expect(d.pending).toBeNull();
  });

  it("double-refund of the same voucher is rejected and does not double-credit", async () => {
    const res = await request(app)
      .post(`/api/pos/orders/${voucherOrderId}/refund`)
      .set("Cookie", cashierCookie)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("already_refunded");

    const manual = await pool.query(
      `SELECT COALESCE(SUM(stamps_remaining),0)::int AS n
         FROM loyalty_manual_stamps
        WHERE vehicle_id = $1 OR plate_norm = $2`,
      [carId, plate.toUpperCase()],
    );
    expect(manual.rows[0].n).toBe(2);
  });

  it("customer can re-redeem the restored stamps", async () => {
    const res = await request(app)
      .post("/api/customer/loyalty/redeem")
      .set("Cookie", custCookie)
      .send({ plate });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    voucherOrderId = res.body.voucher.order_id;
    voucherPaymentRef = res.body.voucher.payment_ref;

    const d = await dashboardStamps();
    expect(d.stamps).toBe(0);
    expect(d.pending?.order_id).toBe(voucherOrderId);
  });

  it("refund racing a concurrent redeem never duplicates vouchers or stamps", async () => {
    // Current state: one live UNSCANNED voucher (from the previous test),
    // 0 stamps left. Fire a manager refund of that voucher and a customer
    // redeem at the same instant. Legal outcomes:
    //   a) redeem sees the still-live voucher -> 409 voucher_pending,
    //      refund restores stamps -> back to 4/4, no redemption rows;
    //   b) refund commits first -> redeem consumes the restored stamps
    //      -> exactly ONE new live voucher, 0 stamps left.
    // Illegal in both: two live vouchers, or stamps left over alongside a
    // live voucher (duplication).
    const [refundRes, redeemRes] = await Promise.all([
      request(app)
        .post(`/api/pos/orders/${voucherOrderId}/refund`)
        .set("Cookie", managerCookie)
        .send({ reason: "race test" }),
      request(app)
        .post("/api/customer/loyalty/redeem")
        .set("Cookie", custCookie)
        .send({ plate }),
    ]);

    expect(refundRes.status).toBe(200);
    expect([201, 409]).toContain(redeemRes.status);

    // Count live (non-refunded, unscanned) vouchers for this car.
    const live = await pool.query(
      `SELECT id, payment_ref FROM orders
        WHERE vehicle_id = $1 AND qr_provider = 'loyalty'
          AND status = 'paid' AND ticket_code IS NULL`,
      [carId],
    );
    const redemptions = await pool.query(
      `SELECT COUNT(*)::int AS n FROM loyalty_redemptions WHERE customer_user_id = $1`,
      [userId],
    );
    const manual = await pool.query(
      `SELECT COALESCE(SUM(stamps_remaining),0)::int AS n
         FROM loyalty_manual_stamps
        WHERE vehicle_id = $1 OR plate_norm = $2`,
      [carId, plate.toUpperCase()],
    );
    const punched = await pool.query(
      `SELECT COUNT(*)::int AS n FROM orders
        WHERE id = ANY($1) AND loyalty_consumed_in IS NOT NULL`,
      [orderIds],
    );
    const available =
      Number(manual.rows[0].n) + (2 - Number(punched.rows[0].n));

    if (redeemRes.status === 201) {
      // Refund landed first; redeem re-consumed the restored stamps.
      expect(live.rows.length).toBe(1);
      expect(redemptions.rows[0].n).toBe(1);
      expect(available).toBe(0);
      const d = await dashboardStamps();
      expect(d.stamps).toBe(0);
      // Clean up the surviving voucher so the suite leaves no live state.
      await pool.query(
        `UPDATE orders SET loyalty_consumed_in = NULL WHERE vehicle_id = $1`,
        [carId],
      );
      await pool.query(
        `DELETE FROM loyalty_redemptions WHERE voucher_order_id = $1`,
        [live.rows[0].id],
      );
      await pool.query(`DELETE FROM orders WHERE id = $1`, [live.rows[0].id]);
    } else {
      // Redeem lost the race with a 409; stamps must be fully restored.
      expect(redeemRes.body.error).toBe("voucher_pending");
      expect(live.rows.length).toBe(0);
      expect(redemptions.rows[0].n).toBe(0);
      expect(available).toBe(REQUIRED);
      const d = await dashboardStamps();
      expect(d.stamps).toBe(REQUIRED);
    }
  });
});
