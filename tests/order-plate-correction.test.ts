import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import type { Express } from "express";
import ws from "ws";
import { createTestApp } from "./helpers/app";

neonConfig.webSocketConstructor = ws as any;
const DB_URL = process.env.DATABASE_URL ?? "";
const tag = Math.random().toString(36).slice(2, 9);
const plate = (prefix: string) => `${prefix}${tag}`.toUpperCase();

describe("manager order plate correction", () => {
  let app: Express;
  let pool: Pool;
  let sourceCar: number;
  let destinationCar: number;
  let sourceUser: number;
  let destinationUser: number;
  let sourceCustomer: number;
  let destinationCustomer: number;
  const ownerId = `opc_owner_${tag}`;
  const managerId = `opc_manager_${tag}`;
  const cashierId = `opc_cashier_${tag}`;
  const ownerSession = `opc_os_${tag}`;
  const managerSession = `opc_ms_${tag}`;
  const cashierSession = `opc_cs_${tag}`;
  const sourceUserSession = `opc_sus_${tag}`;
  const destinationUserSession = `opc_dus_${tag}`;
  const cookie = (id: string) => `cx_staff_session=${id}`;
  const orderIds: string[] = [];
  const carIds: number[] = [];
  const membershipIds: string[] = [];
  const redemptionIds: string[] = [];
  const generatedVoucherIds: string[] = [];

  async function makeOrder(overrides: Record<string, any> = {}) {
    const id = `ord_opc_${Math.random().toString(36).slice(2, 10)}`;
    orderIds.push(id);
    await pool.query(
      `INSERT INTO orders (
         id, branch_id, customer_id, vehicle_id, plate, package_id,
         package_name, package_price_cents, addons, subtotal_cents,
         total_cents, paid_amount_cents, payment_method, ticket_code, status,
         service_charge_cents, tax_cents, discount_cents, promo_discount_cents,
         change_cents, loyalty_consumed_in
       ) VALUES (
         $1, 1, $2, $3, $4, 'pkg_basic_tyre_wax',
         'Full Wash', 1200, '[]'::jsonb, 1200, 1200, 1200, 'cash',
          $5, $7, 17, 23, 31, 41, 9, $6
       )`,
      [
        id,
        overrides.customerId ?? sourceUser,
        overrides.vehicleId === undefined ? sourceCar : overrides.vehicleId,
        overrides.plate ?? plate("SRC"),
        `T-${id.slice(-5)}`,
        overrides.consumed ?? null,
        overrides.status ?? "done",
      ],
    );
    return id;
  }

  async function insertCar(
    licensePlate: string,
    customerId: number | null = null,
    userId: number | null = null,
  ) {
    const result = await pool.query(
      `INSERT INTO cars (license_plate, customer_id, user_id)
       VALUES ($1,$2,$3) RETURNING id`,
      [licensePlate, customerId, userId],
    );
    const id = result.rows[0].id as number;
    carIds.push(id);
    return id;
  }

  beforeAll(async () => {
    if (!DB_URL) throw new Error("DATABASE_URL is required for DB integration tests");
    pool = new Pool({ connectionString: DB_URL });
    app = await createTestApp();
    await pool.query(
      `INSERT INTO staff (id,email,name,role,branch_id,is_active,password_hash)
       VALUES
       ($1,$2,'OPC Owner','owner',NULL,true,'x'),
       ($3,$4,'OPC Manager','manager',1,true,'x'),
       ($5,$6,'OPC Cashier','cashier',1,true,'x')`,
      [
        ownerId, `${ownerId}@test.local`,
        managerId, `${managerId}@test.local`,
        cashierId, `${cashierId}@test.local`,
      ],
    );
    const users = await pool.query(
      `INSERT INTO users(first_name,last_name,email,password)
       VALUES ('Old','Account',$1,'x'),('New','Account',$2,'x')
       RETURNING id`,
      [`old_${tag}@test.local`, `new_${tag}@test.local`],
    );
    sourceUser = users.rows[0].id;
    destinationUser = users.rows[1].id;
    const customers = await pool.query(
      `INSERT INTO customers(phone,name,user_id)
       VALUES ($1,'Old Customer',$2),($3,'New Customer',$4) RETURNING id`,
      [`+673old${tag}`, sourceUser, `+673new${tag}`, destinationUser],
    );
    sourceCustomer = customers.rows[0].id;
    destinationCustomer = customers.rows[1].id;
    sourceCar = await insertCar(plate("SRC"), sourceCustomer, sourceUser);
    destinationCar = await insertCar(plate("DST"), destinationCustomer, destinationUser);
    await pool.query(
      `INSERT INTO auth_sessions(id,user_id,user_type,expires_at)
       VALUES ($1,$2,'staff',now()+interval '1 day'),
              ($3,$4,'staff',now()+interval '1 day'),
              ($5,$6,'staff',now()+interval '1 day'),
              ($7,$8,'customer',now()+interval '1 day'),
              ($9,$10,'customer',now()+interval '1 day')`,
      [
        ownerSession, ownerId, managerSession, managerId, cashierSession, cashierId,
        sourceUserSession, String(sourceUser),
        destinationUserSession, String(destinationUser),
      ],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(`DELETE FROM loyalty_physical_card_transfers WHERE order_id=ANY($1)`, [orderIds]);
      await pool.query(`DELETE FROM membership_redemptions WHERE order_id=ANY($1)`, [orderIds]);
      await pool.query(
        `UPDATE orders
            SET loyalty_consumed_in=NULL
          WHERE loyalty_consumed_in IN (
            SELECT id FROM loyalty_redemptions WHERE customer_user_id=$1
          )`,
        [sourceUser],
      );
      const customerRedemptions = await pool.query(
        `DELETE FROM loyalty_redemptions
          WHERE customer_user_id=$1
          RETURNING voucher_order_id`,
        [sourceUser],
      );
      await pool.query(`DELETE FROM memberships WHERE id=ANY($1)`, [membershipIds]);
      const voucherIds = customerRedemptions.rows.map((row) => row.voucher_order_id);
      if (voucherIds.length > 0) {
        await pool.query(`DELETE FROM orders WHERE id=ANY($1)`, [voucherIds]);
      }
      await pool.query(`DELETE FROM orders WHERE id=ANY($1)`, [orderIds]);
      await pool.query(`DELETE FROM auth_sessions WHERE id=ANY($1)`,
        [[ownerSession, managerSession, cashierSession, sourceUserSession, destinationUserSession]]);
      await pool.query(`DELETE FROM cars WHERE id=ANY($1)`, [carIds]);
      await pool.query(`DELETE FROM customers WHERE id IN ($1,$2)`, [sourceCustomer, destinationCustomer]);
      await pool.query(`DELETE FROM users WHERE id IN ($1,$2)`, [sourceUser, destinationUser]);
      await pool.query(`DELETE FROM staff WHERE id=ANY($1)`, [[ownerId, managerId, cashierId]]);
    } finally {
      await pool.end();
    }
  });

  it("allows owner/manager preview and detail but forbids cashier", async () => {
    const id = await makeOrder();
    const path = `/api/admin/orders/${id}/plate-correction/preview?vehicle_id=${destinationCar}`;
    expect((await request(app).get(path).set("Cookie", cookie(ownerSession))).status).toBe(200);
    const manager = await request(app).get(path).set("Cookie", cookie(managerSession));
    expect(manager.status).toBe(200);
    expect(manager.body).toMatchObject({
      customer_effect: { old_user_id: sourceUser, new_user_id: destinationUser },
      loyalty_effect: {
        eligible_order_moves: true,
        source_stamp_delta: -1,
        destination_stamp_delta: 1,
      },
    });
    expect((await request(app).get(path).set("Cookie", cookie(cashierSession))).status).toBe(403);
    expect((await request(app).post(`/api/admin/orders/${id}/plate-correction`)
      .set("Cookie", cookie(cashierSession))
      .send({ vehicle_id: destinationCar, reason: "Cashier must not correct" })).status).toBe(403);
    expect((await request(app).get(`/api/admin/orders/${id}/plate-correction`)
      .set("Cookie", cookie(managerSession))).status).toBe(200);
  });

  it("moves an existing-car order/customer and preserves every financial field", async () => {
    const id = await makeOrder();
    const before = (await pool.query(`SELECT * FROM orders WHERE id=$1`, [id])).rows[0];
    const response = await request(app)
      .post(`/api/admin/orders/${id}/plate-correction`)
      .set("Cookie", cookie(managerSession))
      .send({
        vehicle_id: destinationCar,
        reason: "Cashier entered the other plate",
        expected_vehicle_id: sourceCar,
        expected_plate: plate("SRC"),
      });
    expect(response.status).toBe(200);
    expect(response.body.order).toMatchObject({
      plate: plate("DST"), vehicle_id: destinationCar, customer_id: destinationUser,
    });
    const after = (await pool.query(`SELECT * FROM orders WHERE id=$1`, [id])).rows[0];
    for (const field of [
      "branch_id", "staff_id", "package_id", "package_name", "package_price_cents",
      "addons", "subtotal_cents", "total_cents", "paid_amount_cents",
      "payment_method", "ticket_code", "status", "service_charge_cents", "tax_cents",
      "discount_cents", "promo_discount_cents", "change_cents",
    ]) expect(after[field]).toEqual(before[field]);

    const audit = (await pool.query(
      `SELECT * FROM order_plate_corrections WHERE order_id=$1`, [id],
    )).rows[0];
    expect(audit).toMatchObject({
      old_plate: plate("SRC"), new_plate: plate("DST"),
      old_vehicle_id: sourceCar, new_vehicle_id: destinationCar,
      old_order_customer_id: sourceUser, new_order_customer_id: destinationUser,
      corrected_by_staff_id: managerId,
      reason: "Cashier entered the other plate",
      old_car_deleted: false,
    });

    const oldHistory = await request(app).get(`/api/pos/vehicles/${sourceCar}/history`)
      .set("Cookie", cookie(ownerSession));
    const newHistory = await request(app).get(`/api/pos/vehicles/${destinationCar}/history`)
      .set("Cookie", cookie(ownerSession));
    expect(oldHistory.body.recent_orders.some((o: any) => o.id === id)).toBe(false);
    expect(newHistory.body.recent_orders.some((o: any) => o.id === id)).toBe(true);
    const oldDashboard = await request(app).get("/api/customer/orders")
      .set("Cookie", `cx_session=${sourceUserSession}`);
    const newDashboard = await request(app).get("/api/customer/orders")
      .set("Cookie", `cx_session=${destinationUserSession}`);
    expect(oldDashboard.body.orders.some((o: any) => o.id === id)).toBe(false);
    expect(newDashboard.body.orders.some((o: any) => o.id === id)).toBe(true);
    const oldLoyalty = await request(app)
      .get(`/api/pos/loyalty/lookup?plate=${plate("SRC")}`)
      .set("Cookie", cookie(ownerSession));
    const newLoyalty = await request(app)
      .get(`/api/pos/loyalty/lookup?plate=${plate("DST")}`)
      .set("Cookie", cookie(ownerSession));
    expect(oldLoyalty.body.eligible_orders.some((o: any) => o.id === id)).toBe(false);
    expect(newLoyalty.body.eligible_orders.some((o: any) => o.id === id)).toBe(true);

    await expect(pool.query(
      `UPDATE order_plate_corrections SET reason='tampered' WHERE order_id=$1`, [id],
    )).rejects.toThrow();
  });

  it("creates a genuinely new normalized car and deletes only an unreferenced typo car", async () => {
    const typoCar = await insertCar(plate("TYPO"));
    const id = await makeOrder({ vehicleId: typoCar, customerId: null, plate: plate("TYPO") });
    const corrected = await request(app)
      .post(`/api/admin/orders/${id}/plate-correction`)
      .set("Cookie", cookie(ownerSession))
      .send({
        new_plate: `  new ${tag}  `,
        reason: "Confirmed plate from registration",
        expected_vehicle_id: typoCar,
        expected_plate: plate("TYPO"),
      });
    expect(corrected.status).toBe(200);
    expect(corrected.body.order.plate).toBe(`NEW${tag}`.toUpperCase());
    carIds.push(corrected.body.order.vehicle_id);
    expect((await pool.query(`SELECT 1 FROM cars WHERE id=$1`, [typoCar])).rowCount).toBe(0);
    expect(corrected.body.correction.old_car_deleted).toBe(true);
    const duplicate = await request(app)
      .get(`/api/admin/orders/${id}/plate-correction/preview?new_plate=${encodeURIComponent(` new ${tag}`)}`)
      .set("Cookie", cookie(ownerSession));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("destination_plate_exists_use_vehicle_id");
  });

  it("retains old cars with ownership or any history reference", async () => {
    const owned = await insertCar(plate("OWN"), sourceCustomer, sourceUser);
    const ownedOrder = await makeOrder({ vehicleId: owned, plate: plate("OWN") });
    expect((await request(app).post(`/api/admin/orders/${ownedOrder}/plate-correction`)
      .set("Cookie", cookie(ownerSession))
      .send({
        vehicle_id: destinationCar,
        reason: "Owned typo retained for audit",
        expected_vehicle_id: owned,
        expected_plate: plate("OWN"),
      })).status).toBe(200);
    expect((await pool.query(`SELECT 1 FROM cars WHERE id=$1`, [owned])).rowCount).toBe(1);

    const referenced = await insertCar(plate("REF"));
    const membershipId = `mem_opc_${tag}`;
    membershipIds.push(membershipId);
    await pool.query(
      `INSERT INTO memberships(id,customer_id,vehicle_id,total_washes,remaining_washes,price_cents,status)
       VALUES ($1,$2,$3,1,1,1200,'active')`,
      [membershipId, sourceCustomer, referenced],
    );
    const referencedOrder = await makeOrder({ vehicleId: referenced, plate: plate("REF") });
    expect((await request(app).post(`/api/admin/orders/${referencedOrder}/plate-correction`)
      .set("Cookie", cookie(ownerSession))
      .send({
        vehicle_id: destinationCar,
        reason: "Referenced typo retained",
        expected_vehicle_id: referenced,
        expected_plate: plate("REF"),
      })).status).toBe(200);
    expect((await pool.query(`SELECT 1 FROM cars WHERE id=$1`, [referenced])).rowCount).toBe(1);
  });

  it("rejects digitally consumed, active physical-card, and membership orders", async () => {
    const consumed = await makeOrder();
    const voucher = await makeOrder();
    const redemptionId = `lr_consumed_${tag}`;
    redemptionIds.push(redemptionId);
    await pool.query(
      `INSERT INTO loyalty_redemptions
         (id,customer_user_id,voucher_order_id,package_id,branch_id)
       VALUES ($1,$2,$3,'pkg_basic_tyre_wax',1)`,
      [redemptionId, sourceUser, voucher],
    );
    await pool.query(`UPDATE orders SET loyalty_consumed_in=$1 WHERE id=$2`, [redemptionId, consumed]);
    const physical = await makeOrder();
    await pool.query(
      `INSERT INTO loyalty_physical_card_transfers
       (id,order_id,transferred_by_staff_id,used_at,used_by_staff_id)
       VALUES ($1,$2,$3,now(),$3)`,
      [`pct_opc_${tag}`, physical, ownerId],
    );
    const membership = await makeOrder();
    const membershipId = `mem_block_opc_${tag}`;
    membershipIds.push(membershipId);
    await pool.query(
      `INSERT INTO memberships(id,customer_id,vehicle_id,total_washes,remaining_washes,price_cents,status)
       VALUES ($1,$2,$3,1,0,1200,'exhausted')`,
      [membershipId, sourceCustomer, sourceCar],
    );
    await pool.query(
      `INSERT INTO membership_redemptions(id,membership_id,order_id,staff_id)
       VALUES ($1,$2,$3,$4)`,
      [`mr_opc_${tag}`, membershipId, membership, ownerId],
    );
    for (const [id, error] of [
      [consumed, "digitally_consumed"],
      [physical, "active_physical_transfer"],
      [membership, "membership_redemption"],
    ]) {
      const response = await request(app)
        .post(`/api/admin/orders/${id}/plate-correction`)
        .set("Cookie", cookie(ownerSession))
        .send({
          vehicle_id: destinationCar,
          reason: "Must be blocked",
          expected_vehicle_id: sourceCar,
          expected_plate: plate("SRC"),
        });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe(error);
    }
  });

  it("serializes concurrent duplicate correction attempts", async () => {
    const id = await makeOrder();
    const alt = await insertCar(plate("ALT"));
    const [a, b] = await Promise.all([
      request(app).post(`/api/admin/orders/${id}/plate-correction`)
        .set("Cookie", cookie(ownerSession))
        .send({
          vehicle_id: destinationCar,
          reason: "First manager correction",
          expected_vehicle_id: sourceCar,
          expected_plate: plate("SRC"),
        }),
      request(app).post(`/api/admin/orders/${id}/plate-correction`)
        .set("Cookie", cookie(managerSession))
        .send({
          vehicle_id: alt,
          reason: "Racing manager correction",
          expected_vehicle_id: sourceCar,
          expected_plate: plate("SRC"),
        }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await pool.query(
      `SELECT count(*)::int n FROM order_plate_corrections WHERE order_id=$1`, [id],
    )).rows[0].n).toBe(1);
  });

  it("allows a later reviewed correction and appends immutable audit history", async () => {
    const id = await makeOrder();
    const first = await request(app).post(`/api/admin/orders/${id}/plate-correction`)
      .set("Cookie", cookie(ownerSession))
      .send({
        vehicle_id: destinationCar,
        reason: "First reviewed correction",
        expected_vehicle_id: sourceCar,
        expected_plate: plate("SRC"),
      });
    expect(first.status).toBe(200);

    const second = await request(app).post(`/api/admin/orders/${id}/plate-correction`)
      .set("Cookie", cookie(managerSession))
      .send({
        vehicle_id: sourceCar,
        reason: "Registration confirmed original car",
        expected_vehicle_id: destinationCar,
        expected_plate: plate("DST"),
      });
    expect(second.status).toBe(200);
    const audit = await pool.query(
      `SELECT old_vehicle_id,new_vehicle_id,reason
         FROM order_plate_corrections
        WHERE order_id=$1
        ORDER BY corrected_at,id`,
      [id],
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0]).toMatchObject({
      old_vehicle_id: sourceCar,
      new_vehicle_id: destinationCar,
      reason: "First reviewed correction",
    });
    expect(audit.rows[1]).toMatchObject({
      old_vehicle_id: destinationCar,
      new_vehicle_id: sourceCar,
      reason: "Registration confirmed original car",
    });
    const detail = await request(app).get(`/api/admin/orders/${id}/plate-correction`)
      .set("Cookie", cookie(ownerSession));
    expect(detail.status).toBe(200);
    expect(detail.body.corrections).toHaveLength(2);
    expect(detail.body.corrections[0].reason).toBe("Registration confirmed original car");
  });

  it("rejects orders that are not completed or paid", async () => {
    const id = await makeOrder({ status: "pending_payment" });
    const response = await request(app).post(`/api/admin/orders/${id}/plate-correction`)
      .set("Cookie", cookie(ownerSession))
      .send({
        vehicle_id: destinationCar,
        reason: "Should wait for payment",
        expected_vehicle_id: sourceCar,
        expected_plate: plate("SRC"),
      });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("order_not_completed");
  });

  it("races a correction against digital redemption without deadlocking or returning 500", async () => {
    const moving = await makeOrder();
    await makeOrder();
    await makeOrder();
    await makeOrder();
    const [correction, redemption] = await Promise.all([
      request(app).post(`/api/admin/orders/${moving}/plate-correction`)
        .set("Cookie", cookie(ownerSession))
        .send({
          vehicle_id: destinationCar,
          reason: "Concurrent loyalty race test",
          expected_vehicle_id: sourceCar,
          expected_plate: plate("SRC"),
        }),
      request(app).post("/api/customer/loyalty/redeem")
        .set("Cookie", `cx_session=${sourceUserSession}`)
        .send({ plate: plate("SRC") }),
    ]);
    expect(correction.status).not.toBe(500);
    expect(redemption.status).not.toBe(500);
    expect([200, 409]).toContain(correction.status);
    expect([200, 201, 400]).toContain(redemption.status);

    const vouchers = await pool.query(
      `SELECT lr.id AS redemption_id, lr.voucher_order_id
         FROM loyalty_redemptions lr
        WHERE lr.customer_user_id=$1
          AND lr.voucher_order_id LIKE 'loy_%'`,
      [sourceUser],
    );
    for (const row of vouchers.rows) {
      redemptionIds.push(row.redemption_id);
      generatedVoucherIds.push(row.voucher_order_id);
    }
  });
});