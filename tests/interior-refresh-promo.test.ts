import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Express } from "express";
import { readFile } from "node:fs/promises";
import { createTestApp } from "./helpers/app";
import { addCalendarDays, bruneiDate, bruneiSlotInstant } from "../server/interiorRefreshRules";

neonConfig.webSocketConstructor = ws as any;

// This is deliberately a staging-DB integration suite.  It tests the trigger
// and exclusion constraint as well as the authenticated HTTP handlers.
const DB_URL = process.env.DATABASE_URL ?? "";
const rid = () => Math.random().toString(36).slice(2, 10);

describe("Task 34: subscriber Interior Refresh", () => {
  let pool: Pool;
  let app: Express;
  const suffix = rid();
  const ids = {
    user: [] as number[], customer: [] as number[], car: [] as number[],
    sub: [] as string[], invoice: [] as string[], staff: [`ir_staff_${suffix}`],
    sessions: [] as string[], booking: [] as string[],
  };
  let branchId: number;
  let originalPromotion: any;
  let userId: number, carId: number, subId: string, entitlementId: string;
  let familyCarIds: number[] = [];
  const customerSession = `ir_customer_${suffix}`;
  const staffSession = `ir_staff_session_${suffix}`;
  const otherBranchStaffSession = `ir_other_staff_session_${suffix}`;
  const customerCookie = `cx_session=${customerSession}`;
  const staffCookie = `cx_staff_session=${staffSession}`;

  const futureDate = () => addCalendarDays(bruneiDate(), 2);
  const periodStart = () => new Date(Date.now() - 3_600_000).toISOString();
  const periodEnd = () => new Date(Date.now() + 20 * 86400_000).toISOString();

  async function seedAccount(plan = "unlimited", isTest = false, vehicleCount = 1) {
    const n = ids.user.length;
    const u = await pool.query(
      `INSERT INTO users (first_name,last_name,email,password) VALUES ('IR','Test',$1,'x') RETURNING id`,
      [`ir_${suffix}_${n}@test.local`],
    );
    const uid = Number(u.rows[0].id); ids.user.push(uid);
    const c = await pool.query(
      `INSERT INTO customers (phone,name,user_id) VALUES ($1,$2,$3) RETURNING id`,
      [`+673ir${suffix}${n}`, `IR ${suffix}`, uid],
    );
    ids.customer.push(Number(c.rows[0].id));
    const vehicles: number[] = [];
    const plates: string[] = [];
    for (let index = 0; index < vehicleCount; index++) {
      const plate = `IR${suffix.slice(0, 5).toUpperCase()}${n}${index}`;
      const car = await pool.query(
        `INSERT INTO cars (license_plate,customer_id,user_id,last_seen_at) VALUES ($1,$2,$3,now()) RETURNING id`,
        [plate, c.rows[0].id, uid],
      );
      vehicles.push(Number(car.rows[0].id));
      plates.push(plate);
      ids.car.push(Number(car.rows[0].id));
    }
    const vehicle = vehicles[0];
    const sub = `ir_sub_${suffix}_${n}`; ids.sub.push(sub);
    await pool.query(
      `INSERT INTO subscriptions
       (id,user_id,customer_id,plan_id,status,price_cents,current_period_start,current_period_end,next_billing_at,car_plate,is_test)
       VALUES ($1,$2,$3,$4,'active',1000,now()-interval '1 hour',now()+interval '30 days',now()+interval '30 days',$5,$6)`,
      [sub, uid, c.rows[0].id, plan, plates.join(","), isTest],
    );
    return { uid, vehicle, vehicles, sub };
  }

  async function paidInvoice(subscriptionId: string, tag: string) {
    const id = `ir_inv_${suffix}_${tag}`; ids.invoice.push(id);
    await pool.query(
      `INSERT INTO subscription_invoices (id,subscription_id,amount_cents,status,period_start,period_end)
       VALUES ($1,$2,1000,'paid',$3,$4)`,
      [id, subscriptionId, periodStart(), periodEnd()],
    );
    return id;
  }

  async function entitlementFor(invoiceId: string, vehicleId?: number) {
    const r = await pool.query(
      `SELECT id FROM interior_refresh_entitlements
       WHERE invoice_id=$1 AND ($2::int IS NULL OR vehicle_id=$2)
       ORDER BY vehicle_id LIMIT 1`,
      [invoiceId, vehicleId ?? null],
    );
    expect(r.rows).toHaveLength(1);
    return r.rows[0].id as string;
  }

  async function insertBooking(entitlement: string, subscription: string, vehicle: number,
    start: Date, status = "booked", claimGuardExempt = true) {
    const id = `irb_${suffix}_${rid()}`; ids.booking.push(id);
    await pool.query(
      `INSERT INTO interior_refresh_bookings
       (id,entitlement_id,subscription_id,vehicle_id,branch_id,slot_start,slot_end,
        booked_by_user_id,status,benefit_period_start,benefit_period_end,claim_guard_exempt)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,e.period_start,e.period_end,$10
       FROM interior_refresh_entitlements e WHERE e.id=$2`,
      [id, entitlement, subscription, vehicle, branchId, start.toISOString(),
        new Date(start.getTime() + 45 * 60_000).toISOString(), userId, status, claimGuardExempt],
    );
    return id;
  }

  beforeAll(async () => {
    if (!DB_URL) throw new Error("STAGING_DATABASE_URL is not set — refusing to run DB tests without a staging DB.");
    pool = new Pool({ connectionString: DB_URL });
    app = await createTestApp();
    const promotion = await pool.query(`SELECT * FROM interior_refresh_promotion WHERE id='subscriber-interior-refresh'`);
    originalPromotion = promotion.rows[0];
    branchId = Number(originalPromotion?.branch_id ??
      (await pool.query(`SELECT id FROM branches ORDER BY id LIMIT 1`)).rows[0]?.id);
    if (!branchId) throw new Error("A branch is required for Interior Refresh tests");
    await pool.query(`UPDATE interior_refresh_promotion SET enabled=true, starts_on=NULL, ends_on=NULL, branch_id=$1 WHERE id='subscriber-interior-refresh'`, [branchId]);
    await pool.query(`INSERT INTO staff (id,email,name,role,branch_id,is_active,password_hash) VALUES ($1,$2,'IR Staff','manager',$3,true,'x')`,
      [ids.staff[0], `ir_staff_${suffix}@test.local`, branchId]);
    const otherBranch = (await pool.query(`SELECT id FROM branches WHERE id <> $1 ORDER BY id LIMIT 1`, [branchId])).rows[0];
    if (!otherBranch) throw new Error("A second branch is required for branch-authorization tests");
    const otherStaffId = `ir_other_staff_${suffix}`;
    ids.staff.push(otherStaffId);
    await pool.query(`INSERT INTO staff (id,email,name,role,branch_id,is_active,password_hash) VALUES ($1,$2,'Other Branch Manager','manager',$3,true,'x')`,
      [otherStaffId, `ir_other_staff_${suffix}@test.local`, otherBranch.id]);
    const main = await seedAccount("family", false, 3);
    userId = main.uid; carId = main.vehicle; subId = main.sub;
    familyCarIds = main.vehicles;
    const invoice = await paidInvoice(subId, "main");
    entitlementId = await entitlementFor(invoice, carId);
    await pool.query(`INSERT INTO auth_sessions (id,user_id,user_type,expires_at) VALUES ($1,$2,'customer',now()+interval '1 day'),($3,$4,'staff',now()+interval '1 day'),($5,$6,'staff',now()+interval '1 day')`,
      [customerSession, String(userId), staffSession, ids.staff[0], otherBranchStaffSession, otherStaffId]);
    ids.sessions.push(customerSession, staffSession, otherBranchStaffSession);
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(`DELETE FROM orders WHERE payment_ref LIKE $1`, [`INTERIOR_REFRESH:irb_${suffix}%`]);
      await pool.query(`DELETE FROM interior_refresh_bookings WHERE id = ANY($1)`, [ids.booking]);
      await pool.query(`DELETE FROM service_history WHERE payment_reference LIKE $1`, [`INTERIOR_REFRESH:irb_${suffix}%`]);
      await pool.query(`DELETE FROM interior_refresh_entitlements WHERE subscription_id = ANY($1)`, [ids.sub]);
      await pool.query(`DELETE FROM subscription_invoices WHERE id = ANY($1)`, [ids.invoice]);
      await pool.query(`DELETE FROM auth_sessions WHERE id = ANY($1)`, [ids.sessions]);
      await pool.query(`DELETE FROM subscriptions WHERE id = ANY($1)`, [ids.sub]);
      await pool.query(`DELETE FROM cars WHERE id = ANY($1)`, [ids.car]);
      await pool.query(`DELETE FROM customers WHERE id = ANY($1)`, [ids.customer]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids.user]);
      await pool.query(`DELETE FROM staff WHERE id = ANY($1)`, [ids.staff]);
      if (originalPromotion) await pool.query(
        `UPDATE interior_refresh_promotion SET enabled=$1,starts_on=$2,ends_on=$3,branch_id=$4,updated_by_staff_id=$5 WHERE id='subscriber-interior-refresh'`,
        [originalPromotion.enabled, originalPromotion.starts_on, originalPromotion.ends_on, originalPromotion.branch_id, originalPromotion.updated_by_staff_id],
      );
    } finally { await pool.end(); }
  });

  it("creates exactly one entitlement per covered Family car, including retries", async () => {
    const n = await pool.query(`SELECT count(*)::int n FROM interior_refresh_entitlements WHERE invoice_id=$1`,
      [ids.invoice[0]]);
    expect(n.rows[0].n).toBe(3);
    await pool.query(`UPDATE subscription_invoices SET status='paid', period_start=period_start, period_end=period_end WHERE id=$1`, [ids.invoice[0]]);
    const again = await pool.query(`SELECT count(*)::int n FROM interior_refresh_entitlements WHERE invoice_id=$1`, [ids.invoice[0]]);
    expect(again.rows[0].n).toBe(3);
    expect((await pool.query(
      `SELECT count(DISTINCT vehicle_id)::int n FROM interior_refresh_entitlements WHERE invoice_id=$1`,
      [ids.invoice[0]],
    )).rows[0].n).toBe(3);
  });

  it("seeds new installations with the promotion enabled", async () => {
    const migration = await readFile(
      "migrations/manual/2026-08-30_01_interior_refresh_promo.sql",
      "utf8",
    );
    expect(migration).toMatch(
      /INSERT INTO interior_refresh_promotion\(id,enabled,branch_id\)[\s\S]*SELECT 'subscriber-interior-refresh',true,id/,
    );
  });

  it("denies schedule data and status changes to managers from other branches", async () => {
    const otherCookie = `cx_staff_session=${otherBranchStaffSession}`;
    const access = await request(app)
      .get("/api/staff/interior-refresh/access")
      .set("Cookie", otherCookie);
    expect(access.status).toBe(200);
    expect(access.body.can_manage).toBe(false);

    const schedule = await request(app)
      .get(`/api/staff/interior-refresh/schedule?date=${futureDate()}`)
      .set("Cookie", otherCookie);
    expect(schedule.status).toBe(403);

    const status = await request(app)
      .patch("/api/staff/interior-refresh/bookings/not-a-booking/status")
      .set("Cookie", otherCookie)
      .send({ status: "checked_in" });
    expect(status.status).toBe(403);
  });

  it("does not create entitlements for pending, failed, or test subscription invoices", async () => {
    const normal = await seedAccount();
    const test = await seedAccount("unlimited", true);
    for (const [status, sub] of [["pending", normal.sub], ["failed", normal.sub], ["paid", test.sub]] as const) {
      const id = `ir_inv_${suffix}_${status}_${rid()}`; ids.invoice.push(id);
      await pool.query(`INSERT INTO subscription_invoices (id,subscription_id,amount_cents,status,period_start,period_end) VALUES ($1,$2,1,$3,$4,$5)`,
        [id, sub, status, periodStart(), periodEnd()]);
      expect((await pool.query(`SELECT count(*)::int n FROM interior_refresh_entitlements WHERE invoice_id=$1`, [id])).rows[0].n).toBe(0);
    }
  });

  it("lets each covered Family car claim once in the same billing cycle", async () => {
    const r = await pool.query(`SELECT count(*)::int n FROM interior_refresh_entitlements WHERE subscription_id=$1`, [subId]);
    expect(r.rows[0].n).toBe(3);
    const starts = ["13:00", "13:45", "14:30"];
    const bookings = [];
    for (let i = 0; i < familyCarIds.length; i++) {
      const booked = await request(app)
        .post("/api/subscriptions/interior-refresh/bookings")
        .set("Cookie", customerCookie)
        .send({ vehicle_id: familyCarIds[i], date: futureDate(), start_time: starts[i] });
      expect(booked.status).toBe(201);
      ids.booking.push(booked.body.booking.id);
      bookings.push(booked.body.booking.id);
    }
    const claimed = await pool.query(
      `SELECT vehicle_id, status FROM interior_refresh_entitlements
       WHERE invoice_id=$1 ORDER BY vehicle_id`,
      [ids.invoice[0]],
    );
    expect(claimed.rows).toHaveLength(3);
    expect(claimed.rows.map((row: any) => Number(row.vehicle_id)).sort((a: number, b: number) => a - b))
      .toEqual([...familyCarIds].sort((a, b) => a - b));
    expect(claimed.rows.every((row: any) => row.status === "booked")).toBe(true);
    for (let i = 0; i < familyCarIds.length; i++) {
      const duplicate = await request(app)
        .post("/api/subscriptions/interior-refresh/bookings")
        .set("Cookie", customerCookie)
        .send({ vehicle_id: familyCarIds[i], date: futureDate(), start_time: ["15:15", "16:00", "16:45"][i] });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error).toBe("no_available_entitlement");
    }
    for (const id of bookings) {
      expect((await request(app)
        .delete(`/api/subscriptions/interior-refresh/bookings/${id}`)
        .set("Cookie", customerCookie)).status).toBe(200);
    }
  });

  it("blocks a second same-car claim in an overlapping billing period", async () => {
    const guarded = await seedAccount();
    const firstInvoice = await paidInvoice(guarded.sub, `same_car_guard_first_${rid()}`);
    const firstEntitlement = await entitlementFor(firstInvoice, guarded.vehicle);
    const first = await insertBooking(
      firstEntitlement,
      guarded.sub,
      guarded.vehicle,
      bruneiSlotInstant(futureDate(), "17:30")!,
      "completed",
      false,
    );
    const overlappingInvoice = await paidInvoice(guarded.sub, `same_car_guard_second_${rid()}`);
    const overlappingEntitlement = await entitlementFor(overlappingInvoice, guarded.vehicle);
    await expect(insertBooking(
      overlappingEntitlement,
      guarded.sub,
      guarded.vehicle,
      bruneiSlotInstant(futureDate(), "18:15")!,
      "completed",
      false,
    )).rejects.toMatchObject({ code: "23P01" });
    await pool.query(`UPDATE interior_refresh_bookings SET status='cancelled' WHERE id=$1`, [first]);
  });

  it("denies booking after the entitled car is transferred away", async () => {
    const other = await seedAccount();
    const booked = await request(app)
      .post("/api/subscriptions/interior-refresh/bookings")
      .set("Cookie", customerCookie)
      .send({ vehicle_id: familyCarIds[1], date: futureDate(), start_time: "16:45" });
    expect(booked.status).toBe(201);
    ids.booking.push(booked.body.booking.id);
    await pool.query(`UPDATE cars SET user_id=$1 WHERE id = ANY($2)`, [other.uid, [carId, familyCarIds[1]]]);
    try {
      const summary = await request(app)
        .get("/api/subscriptions/interior-refresh")
        .set("Cookie", customerCookie);
      expect(summary.status).toBe(200);
      expect(summary.body.vehicles.some((vehicle: any) =>
        [carId, familyCarIds[1]].includes(Number(vehicle.id)))).toBe(false);
      expect(summary.body.entitlements.some((entitlement: any) =>
        [carId, familyCarIds[1]].includes(Number(entitlement.vehicle_id)))).toBe(false);
      expect(summary.body.bookings.some((row: any) =>
        Number(row.vehicle_id) === familyCarIds[1])).toBe(false);

      const availability = await request(app)
        .get(`/api/subscriptions/interior-refresh/availability?date=${futureDate()}&vehicle_id=${carId}`)
        .set("Cookie", customerCookie);
      expect(availability.status).toBe(403);
      const booking = await request(app)
        .post("/api/subscriptions/interior-refresh/bookings")
        .set("Cookie", customerCookie)
        .send({ vehicle_id: carId, date: futureDate(), start_time: "17:30" });
      expect(booking.status).toBe(409);
      expect(booking.body.error).toBe("no_available_entitlement");

      const qr = await request(app)
        .post(`/api/subscriptions/interior-refresh/bookings/${booked.body.booking.id}/qr`)
        .set("Cookie", customerCookie)
        .send({});
      expect(qr.status).toBe(404);
      const cancellation = await request(app)
        .delete(`/api/subscriptions/interior-refresh/bookings/${booked.body.booking.id}`)
        .set("Cookie", customerCookie);
      expect(cancellation.status).toBe(404);

      const renewalInvoice = await paidInvoice(subId, `after_transfer_${rid()}`);
      const renewalEntitlements = await pool.query(
        `SELECT vehicle_id FROM interior_refresh_entitlements WHERE invoice_id=$1`,
        [renewalInvoice],
      );
      expect(renewalEntitlements.rows.some((row: any) =>
        [carId, familyCarIds[1]].includes(Number(row.vehicle_id)))).toBe(false);
    } finally {
      await pool.query(`UPDATE cars SET user_id=$1 WHERE id = ANY($2)`, [userId, [carId, familyCarIds[1]]]);
      await request(app)
        .delete(`/api/subscriptions/interior-refresh/bookings/${booked.body.booking.id}`)
        .set("Cookie", customerCookie);
    }
  });

  it("does not present a live-period benefit from an ineligible subscription", async () => {
    await pool.query(`UPDATE subscriptions SET status='cancelled' WHERE id=$1`, [subId]);
    try {
      const summary = await request(app)
        .get("/api/subscriptions/interior-refresh")
        .set("Cookie", customerCookie);
      expect(summary.status).toBe(200);
      expect(summary.body.entitlements).toHaveLength(0);
      expect(summary.body.vehicles).toHaveLength(0);
    } finally {
      await pool.query(`UPDATE subscriptions SET status='active' WHERE id=$1`, [subId]);
    }
  });

  it("does not count an unresolved legacy entitlement as available", async () => {
    const legacyId = `ire_legacy_unresolved_${suffix}`;
    await pool.query(
      `INSERT INTO interior_refresh_entitlements
       (id,subscription_id,invoice_id,vehicle_id,period_start,period_end,status)
       VALUES ($1,$2,$3,NULL,$4,$5,'available')`,
      [legacyId, subId, ids.invoice[0], periodStart(), periodEnd()],
    );
    const summary = await request(app)
      .get("/api/subscriptions/interior-refresh")
      .set("Cookie", customerCookie);
    expect(summary.status).toBe(200);
    expect(summary.body.entitlements.some((row: any) => row.id === legacyId)).toBe(false);
  });

  it("rejects overlapping live slots at the database boundary", async () => {
    const start = bruneiSlotInstant(futureDate(), "08:00")!;
    const b = await insertBooking(entitlementId, subId, carId, start);
    // A different entitlement proves this is the range exclusion constraint,
    // not merely the one-live-booking-per-entitlement unique index.
    const other = await seedAccount();
    const otherInvoice = await paidInvoice(other.sub, `overlap_${rid()}`);
    const otherEntitlement = await entitlementFor(otherInvoice, other.vehicle);
    await expect(insertBooking(otherEntitlement, other.sub, other.vehicle,
      new Date(start.getTime() + 15 * 60_000))).rejects.toMatchObject({ code: "23P01" });
    await pool.query(`UPDATE interior_refresh_bookings SET status='cancelled' WHERE id=$1`, [b]);
  });

  it("cancellation restores the entitlement and allows another booking", async () => {
    const date = futureDate();
    const first = await request(app).post("/api/subscriptions/interior-refresh/bookings").set("Cookie", customerCookie).send({ vehicle_id: carId, date, start_time: "08:00" });
    expect(first.status).toBe(201);
    ids.booking.push(first.body.booking.id);
    const cancelled = await request(app).delete(`/api/subscriptions/interior-refresh/bookings/${first.body.booking.id}`).set("Cookie", customerCookie);
    expect(cancelled.status).toBe(200);
    expect((await pool.query(`SELECT status FROM interior_refresh_entitlements WHERE id=$1`, [entitlementId])).rows[0].status).toBe("available");
    const replacement = await request(app).post("/api/subscriptions/interior-refresh/bookings").set("Cookie", customerCookie).send({ vehicle_id: carId, date, start_time: "08:45" });
    expect(replacement.status).toBe(201);
    ids.booking.push(replacement.body.booking.id);
  });

  it("allows only one concurrent booking for the available entitlement", async () => {
    // Release the replacement booking from the cancellation test, then race two
    // claims for the same entitlement and slot.
    const existing = (await pool.query(
      `SELECT id FROM interior_refresh_bookings WHERE entitlement_id=$1 AND status='booked' ORDER BY created_at DESC LIMIT 1`,
      [entitlementId],
    )).rows[0].id;
    await pool.query(`UPDATE interior_refresh_bookings SET status='cancelled' WHERE id=$1`, [existing]);
    await pool.query(`UPDATE interior_refresh_entitlements SET status='available' WHERE id=$1`, [entitlementId]);
    const [a, b] = await Promise.all([
      request(app).post("/api/subscriptions/interior-refresh/bookings").set("Cookie", customerCookie).send({ vehicle_id: carId, date: futureDate(), start_time: "09:30" }),
      request(app).post("/api/subscriptions/interior-refresh/bookings").set("Cookie", customerCookie).send({ vehicle_id: carId, date: futureDate(), start_time: "09:30" }),
    ]);
    expect([a.status, b.status].filter((x) => x === 201)).toHaveLength(1);
    expect([a.status, b.status].filter((x) => x === 409)).toHaveLength(1);
    const winner = [a, b].find((r) => r.status === 201)!;
    ids.booking.push(winner.body.booking.id);
    await pool.query(`UPDATE interior_refresh_bookings SET status='cancelled' WHERE id=$1`, [winner.body.booking.id]);
    await pool.query(`UPDATE interior_refresh_entitlements SET status='available' WHERE id=$1`, [entitlementId]);
  });

  it("no-show consumes, and duplicate staff transitions cannot create service records twice", async () => {
    // A historical direct fixture is needed because no-show is deliberately
    // prohibited before the appointment has ended.
    await pool.query(`UPDATE interior_refresh_entitlements SET status='booked' WHERE id=$1`, [entitlementId]);
    const past = new Date(Date.now() - 2 * 3600_000);
    const booking = await insertBooking(entitlementId, subId, carId, past);
    const [one, two] = await Promise.all([
      request(app).patch(`/api/staff/interior-refresh/bookings/${booking}/status`).set("Cookie", staffCookie).send({ status: "no_show" }),
      request(app).patch(`/api/staff/interior-refresh/bookings/${booking}/status`).set("Cookie", staffCookie).send({ status: "no_show" }),
    ]);
    expect([one.status, two.status].filter((x) => x === 200)).toHaveLength(1);
    expect((await pool.query(`SELECT status FROM interior_refresh_entitlements WHERE id=$1`, [entitlementId])).rows[0].status).toBe("used");
    expect((await pool.query(`SELECT count(*)::int n FROM service_history WHERE payment_reference=$1`, [`INTERIOR_REFRESH:${booking}`])).rows[0].n).toBe(0);
  });

  it("claims a booked QR once, creates one B$0 voucher order, and beats cancellation", async () => {
    const invoice = await paidInvoice(subId, "checkin");
    const e = await entitlementFor(invoice, carId);
    await pool.query(`UPDATE interior_refresh_entitlements SET status='booked' WHERE id=$1`, [e]);
    // The status endpoint permits same-day check-in from 15 minutes before the
    // slot; a one-minute-old fixture also makes customer cancellation illegal.
    const booking = await insertBooking(e, subId, carId, new Date(Date.now() - 60_000));
    const issued = await request(app)
      .post(`/api/subscriptions/interior-refresh/bookings/${booking}/qr`)
      .set("Cookie", customerCookie)
      .send({});
    expect(issued.status).toBe(200);
    expect(issued.body.voucher.claimed).toBe(false);
    expect(JSON.parse(issued.body.voucher.qr_payload)).toEqual({
      type: "INTERIOR_REFRESH",
      booking_id: booking,
    });
    const wrongBranchStaff = await request(app)
      .post("/api/verify-qr")
      .set("Cookie", `cx_staff_session=${otherBranchStaffSession}`)
      .send({ qr_data: issued.body.voucher.qr_payload, branch_id: branchId });
    expect(wrongBranchStaff.status).toBe(403);
    expect(wrongBranchStaff.body.code).toBe("tungku_staff_only");

    const [checkin, cancel] = await Promise.all([
      request(app).post("/api/verify-qr").set("Cookie", staffCookie).send({
        qr_data: issued.body.voucher.qr_payload,
        branch_id: branchId,
      }),
      request(app).delete(`/api/subscriptions/interior-refresh/bookings/${booking}`).set("Cookie", customerCookie),
    ]);
    expect(checkin.status).toBe(200);
    expect(cancel.status).toBe(409);
    expect(checkin.body.order.total_cents).toBe(0);
    expect(checkin.body.order.package_name).toBe("Interior Refresh");
    const service = await pool.query(`SELECT count(*)::int n FROM service_history WHERE payment_reference=$1`, [`INTERIOR_REFRESH:${booking}`]);
    expect(service.rows[0].n).toBe(1);
    const duplicate = await request(app).post("/api/verify-qr").set("Cookie", staffCookie).send({
      qr_data: issued.body.voucher.qr_payload,
      branch_id: branchId,
    });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.newly_allocated).toBe(false);
    expect(duplicate.body.order.id).toBe(checkin.body.order.id);
    expect((await pool.query(`SELECT count(*)::int n FROM service_history WHERE payment_reference=$1`, [`INTERIOR_REFRESH:${booking}`])).rows[0].n).toBe(1);
    const order = await pool.query(
      `SELECT count(*)::int n, min(payment_method) payment_method,
        min(qr_provider) qr_provider, min(order_type) order_type,
        min(total_cents)::int total_cents
       FROM orders WHERE payment_ref=$1`,
      [`INTERIOR_REFRESH:${booking}`],
    );
    expect(order.rows[0]).toMatchObject({
      n: 1,
      payment_method: "voucher",
      qr_provider: "interior_refresh",
      order_type: "interior_refresh_promo",
      total_cents: 0,
    });
    const manual = await request(app)
      .patch(`/api/staff/interior-refresh/bookings/${booking}/status`)
      .set("Cookie", staffCookie)
      .send({ status: "checked_in" });
    expect(manual.status).toBe(409);
    expect(manual.body.error).toBe("qr_scan_required");
  });

  it("does not book past period end and disabling promotion preserves schedule/history", async () => {
    const invoice = await paidInvoice(subId, "short");
    const e = await entitlementFor(invoice, carId);
    await pool.query(`UPDATE interior_refresh_entitlements SET period_end=now()+interval '1 hour' WHERE id=$1`, [e]);
    const tooLate = await request(app).post("/api/subscriptions/interior-refresh/bookings").set("Cookie", customerCookie)
      .send({ vehicle_id: carId, date: futureDate(), start_time: "08:00" });
    expect(tooLate.status).toBe(409);
    await pool.query(`UPDATE interior_refresh_promotion SET enabled=false WHERE id='subscriber-interior-refresh'`);
    const blocked = await request(app).post("/api/subscriptions/interior-refresh/bookings").set("Cookie", customerCookie)
      .send({ vehicle_id: carId, date: futureDate(), start_time: "08:00" });
    expect(blocked.status).toBe(409);
    const summary = await request(app).get("/api/subscriptions/interior-refresh").set("Cookie", customerCookie);
    expect(summary.status).toBe(200);
    expect(summary.body.bookings.some((b: any) => b.id)).toBe(true);
  });
});