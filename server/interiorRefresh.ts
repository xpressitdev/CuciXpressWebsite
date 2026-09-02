import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { requireLuciaUser, requireStaff, requireStaffRole } from "./auth/middleware";
import {
  INTERIOR_REFRESH,
  addCalendarDays,
  bruneiDate,
  bruneiSlotInstant,
  generateInteriorRefreshSlots,
  isCalendarDate,
  slotsOverlap,
} from "./interiorRefreshRules";

function staffCanUseTungku(req: Request, branchId: number): boolean {
  const u = req.staff?.user as any;
  return !!u && (u.role === "owner" || Number(u.branchId) === branchId);
}

async function config(executor: any = db): Promise<any | null> {
  return (await executor.execute(sql`
    SELECT p.*, b.name AS branch_name
    FROM interior_refresh_promotion p
    LEFT JOIN branches b ON b.id = p.branch_id
    WHERE p.id = ${INTERIOR_REFRESH.id}
  `)).rows[0] as any ?? null;
}

function configOpen(c: any, date: string): boolean {
  return c?.enabled === true
    && (!c.starts_on || date >= String(c.starts_on))
    && (!c.ends_on || date <= String(c.ends_on));
}

function dbError(res: Response, label: string, err: any) {
  console.error(`[interior-refresh.${label}]`, err?.message ?? err);
  return res.status(500).json({ error: "internal_error" });
}

function ticketOrderBody(order: any, newlyAllocated: boolean, message: string) {
  return {
    success: true,
    message,
    newly_allocated: newlyAllocated,
    order: {
      id: order.id,
      ticket_code: order.ticket_code,
      plate: order.plate,
      package_name: order.package_name,
      total_cents: Number(order.total_cents ?? 0),
      branch_id: order.branch_id,
      branch_name: order.branch_name,
      status: order.status,
      customer: order.customer_name
        ? { name: order.customer_name, phone: order.customer_phone ?? null }
        : null,
      is_prepaid: true,
    },
  };
}

/**
 * Claim an Interior Refresh appointment from the shared lane QR endpoint.
 * The caller owns the transaction so locking the booking and entitlement is
 * inseparable from creating the zero-value POS order.
 */
export async function verifyInteriorRefreshQr(
  tx: any,
  payload: any,
  scanBranchId: number | null,
  staff: { id: string; role: string; branchId: number | null },
) {
  if (typeof payload?.booking_id !== "string" || payload.booking_id.length === 0) {
    return { http: 400, body: { success: false, code: "invalid_interior_refresh_qr", message: "Invalid Interior Refresh QR code" } };
  }

  const c = await config(tx);
  if (!c?.branch_id) {
    return { http: 503, body: { success: false, code: "tungku_not_configured", message: "Interior Refresh Tungku branch is not configured" } };
  }
  if (scanBranchId === null || Number(c.branch_id) !== scanBranchId) {
    return { http: 403, body: { success: false, code: "tungku_branch_required", message: "Interior Refresh appointments may only be scanned at the configured Tungku branch" } };
  }
  if (staff.role !== "owner" && Number(staff.branchId) !== Number(c.branch_id)) {
    return { http: 403, body: { success: false, code: "tungku_staff_only", message: "Only Tungku staff may scan Interior Refresh appointments" } };
  }

  const booking = (await tx.execute(sql`
    SELECT b.*, e.status AS entitlement_status, c.license_plate,
      br.name AS branch_name, s.user_id,
      u.first_name, u.last_name, u.phone_number
    FROM interior_refresh_bookings b
    JOIN interior_refresh_entitlements e ON e.id = b.entitlement_id
    JOIN subscriptions s ON s.id = b.subscription_id
    JOIN cars c ON c.id = b.vehicle_id
    JOIN branches br ON br.id = b.branch_id
    LEFT JOIN users u ON u.id = s.user_id
    WHERE b.id = ${payload.booking_id} AND b.branch_id = ${c.branch_id}
    FOR UPDATE OF b, e
  `)).rows[0] as any;
  if (!booking) {
    return { http: 404, body: { success: false, code: "booking_not_found", message: "Interior Refresh booking was not found at this branch" } };
  }

  // The day comparison deliberately happens in PostgreSQL's Brunei timezone,
  // rather than using the server's local timezone.
  const timing = (await tx.execute(sql`
    SELECT
      ((${booking.slot_start}::timestamptz AT TIME ZONE 'Asia/Brunei')::date
        = (now() AT TIME ZONE 'Asia/Brunei')::date) AS correct_day,
      now() >= ${booking.slot_start}::timestamptz - interval '15 minutes' AS check_in_open
  `)).rows[0] as any;
  if (!timing?.correct_day || !timing?.check_in_open) {
    return { http: 409, body: { success: false, code: "check_in_wrong_day", message: "This appointment can only be checked in on its Brunei booking day, from 15 minutes before its slot" } };
  }

  const paymentRef = `INTERIOR_REFRESH:${booking.id}`;
  const existing = (await tx.execute(sql`
    SELECT o.*, br.name AS branch_name
    FROM orders o
    LEFT JOIN branches br ON br.id = o.branch_id
    WHERE o.payment_ref = ${paymentRef} AND o.qr_provider = 'interior_refresh'
    LIMIT 1
    FOR UPDATE OF o
  `)).rows[0] as any;
  if (existing) {
    existing.customer_name = [booking.first_name, booking.last_name].filter(Boolean).join(" ") || null;
    existing.customer_phone = booking.phone_number;
    return { http: 200, body: ticketOrderBody(existing, false, "Already in queue") };
  }
  if (booking.status !== "booked" || booking.entitlement_status !== "booked") {
    return { http: 409, body: { success: false, code: "booking_not_checkin_ready", message: "This Interior Refresh booking is no longer available for check-in" } };
  }

  const serviceId = booking.service_history_id || (await tx.execute(sql`
    INSERT INTO service_history
      (user_id, car_plate, service_type, branch, amount, status,
       check_in_time, payment_reference, notes)
    VALUES (${booking.user_id}, ${booking.license_plate}, 'interior_refresh_promo',
      ${booking.branch_name}, 0, 'checked_in', now(), ${paymentRef},
      'Subscriber Interior Refresh promotional benefit; excluded from wash, loyalty and sales reporting')
    RETURNING id
  `)).rows[0]?.id;

  const consumed = (await tx.execute(sql`
    UPDATE interior_refresh_entitlements SET status='used', consumed_at=now()
    WHERE id=${booking.entitlement_id} AND status='booked' RETURNING id
  `)).rows;
  if (!consumed.length) {
    throw new Error("interior_refresh_entitlement_invariant_failed");
  }
  const checkedIn = (await tx.execute(sql`
    UPDATE interior_refresh_bookings
    SET status='checked_in', checked_in_at=now(), updated_by_staff_id=${staff.id},
      service_history_id=${serviceId ?? null}, updated_at=now()
    WHERE id=${booking.id} AND status='booked'
    RETURNING id
  `)).rows;
  if (!checkedIn.length) {
    throw new Error("interior_refresh_booking_invariant_failed");
  }

  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(
      ${Number(c.branch_id)},
      ((now() AT TIME ZONE 'UTC')::date - DATE '2000-01-01')::int
    )
  `);
  const seqRow = (await tx.execute(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(ticket_code, '\\D', '', 'g'), '')::int), 0) + 1 AS next_seq
    FROM orders
    WHERE branch_id=${c.branch_id} AND ticket_day=(now() AT TIME ZONE 'UTC')::date
  `)).rows[0] as any;
  const ticketCode = `T-${String(seqRow?.next_seq ?? 1).padStart(3, "0")}`;
  const order = (await tx.execute(sql`
    INSERT INTO orders (
      id, branch_id, plate, vehicle_id, customer_id,
      package_name, package_price_cents, addons, subtotal_cents, total_cents,
      payment_method, payment_ref, qr_provider, order_type, status,
      ticket_code, ticket_day, claimed_at
    ) VALUES (
      ${`ord_ir_${randomUUID()}`}, ${c.branch_id}, ${booking.license_plate},
      ${booking.vehicle_id}, ${booking.user_id},
      'Interior Refresh', 0, '[]'::jsonb, 0, 0,
      'voucher', ${paymentRef}, 'interior_refresh', 'interior_refresh_promo', 'queued',
      ${ticketCode}, (now() AT TIME ZONE 'UTC')::date, now()
    )
    RETURNING *
  `)).rows[0] as any;
  order.branch_name = booking.branch_name;
  order.customer_name = [booking.first_name, booking.last_name].filter(Boolean).join(" ") || null;
  order.customer_phone = booking.phone_number;
  return { http: 200, body: ticketOrderBody(order, true, "Ticket allocated") };
}

const bookingSchema = z.object({
  vehicle_id: z.coerce.number().int().positive(),
  date: z.string(),
  start_time: z.string(),
  reminder_opt_in: z.boolean().default(false),
});

const configSchema = z.object({
  enabled: z.boolean(),
  starts_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),
}).superRefine((v, ctx) => {
  for (const key of ["starts_on", "ends_on"] as const) {
    if (v[key] != null && !isCalendarDate(v[key]!)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "Invalid Brunei date" });
    }
  }
  if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ends_on"], message: "Must not precede starts_on" });
  }
});

export function registerInteriorRefreshRoutes(app: Express) {
  // Customer benefit, covered vehicles and complete booking history.
  app.get("/api/subscriptions/interior-refresh", requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    try {
      const c = await config();
      const entitlements = (await db.execute(sql`
        SELECT e.*, s.plan_id, c.license_plate, c.brand, c.model,
          CASE WHEN e.status = 'available' AND e.period_end <= now() THEN 'expired'
               ELSE e.status END AS display_status
        FROM interior_refresh_entitlements e
        JOIN subscriptions s ON s.id = e.subscription_id
        JOIN cars c ON c.id = e.vehicle_id
        WHERE s.user_id = ${userId}
          AND s.status IN ('active','past_due')
          AND c.user_id = ${userId}
        ORDER BY (s.status IN ('active','past_due') AND now() >= e.period_start AND now() < e.period_end) DESC,
                 e.period_end DESC
      `)).rows;
      const vehicles = (await db.execute(sql`
        SELECT DISTINCT c.id, c.license_plate, c.brand, c.model, e.id AS entitlement_id
        FROM interior_refresh_entitlements e
        JOIN subscriptions s ON s.id = e.subscription_id
        JOIN cars c ON c.id = e.vehicle_id
        WHERE s.user_id = ${userId}
          AND c.user_id = ${userId}
          AND s.status IN ('active','past_due') AND now() >= e.period_start AND now() < e.period_end
      `)).rows;
      const bookings = (await db.execute(sql`
        SELECT b.*, c.license_plate, br.name AS branch_name,
          (b.status IN ('checked_in','completed','no_show')) AS claimed
        FROM interior_refresh_bookings b
        JOIN subscriptions s ON s.id = b.subscription_id
        JOIN cars c ON c.id = b.vehicle_id
        JOIN branches br ON br.id = b.branch_id
        WHERE s.user_id = ${userId}
          AND c.user_id = ${userId}
        ORDER BY b.slot_start DESC
      `)).rows;
      res.set("Cache-Control", "no-store");
      res.json({
        promotion: c ? {
          enabled: c.enabled, starts_on: c.starts_on, ends_on: c.ends_on,
          branch: c.branch_id ? { id: c.branch_id, name: c.branch_name } : null,
          duration_minutes: 45, capacity: 1, opens_at: "08:00", final_start_at: "18:15",
          timezone: INTERIOR_REFRESH.zone,
        } : null,
        entitlements, vehicles, bookings, brunei_today: bruneiDate(),
      });
    } catch (err) { dbError(res, "summary", err); }
  });

  app.get("/api/subscriptions/interior-refresh/availability", requireLuciaUser, async (req, res) => {
    const date = String(req.query.date ?? "");
    const vehicleId = Number(req.query.vehicle_id);
    if (!isCalendarDate(date)) return res.status(400).json({ error: "invalid_date" });
    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
      return res.status(400).json({ error: "invalid_vehicle" });
    }
    const today = bruneiDate();
    if (date <= today) return res.status(400).json({ error: "previous_day_booking_required" });
    if (date > addCalendarDays(today, 30)) return res.status(400).json({ error: "too_far_ahead" });
    try {
      const c = await config();
      if (!c?.branch_id) return res.status(503).json({ error: "tungku_not_configured" });
      if (!configOpen(c, date)) return res.status(409).json({ error: "promotion_unavailable" });
      const entitlement = (await db.execute(sql`
        SELECT e.id, e.period_start, e.period_end
        FROM interior_refresh_entitlements e
        JOIN subscriptions s ON s.id=e.subscription_id
        JOIN cars owned_car ON owned_car.id=e.vehicle_id
        WHERE s.user_id=${Number(req.lucia!.user!.id)}
          AND owned_car.user_id=${Number(req.lucia!.user!.id)}
          AND s.status IN ('active','past_due') AND e.status='available'
          AND e.vehicle_id=${vehicleId}
          AND now() >= e.period_start AND now() < e.period_end
        ORDER BY e.period_end DESC LIMIT 1
      `)).rows[0] as any;
      // No entitlement means no branch occupancy information is disclosed.
      if (!entitlement) return res.status(403).json({ error: "no_available_entitlement" });
      const occupied = (await db.execute(sql`
        SELECT slot_start, slot_end FROM interior_refresh_bookings
        WHERE branch_id = ${c.branch_id}
          AND status IN ('booked','checked_in')
          AND (slot_start AT TIME ZONE 'Asia/Brunei')::date = ${date}::date
      `)).rows as any[];
      const slots = generateInteriorRefreshSlots().map((time) => {
        const start = bruneiSlotInstant(date, time)!;
        const end = new Date(start.getTime() + 45 * 60_000);
        const available = start >= new Date(entitlement.period_start)
          && end <= new Date(entitlement.period_end)
          && !occupied.some((o) =>
          slotsOverlap(start, end, new Date(o.slot_start), new Date(o.slot_end)));
        return { start_time: time, starts_at: start.toISOString(), available };
      });
      res.set("Cache-Control", "no-store");
      res.json({ date, timezone: INTERIOR_REFRESH.zone, duration_minutes: 45, slots,
        entitlement: { id: entitlement.id, period_start: entitlement.period_start, period_end: entitlement.period_end },
        bookable_until: entitlement.period_end });
    } catch (err) { dbError(res, "availability", err); }
  });

  app.post("/api/subscriptions/interior-refresh/bookings", requireLuciaUser, async (req, res) => {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_request" });
    const { vehicle_id, date, start_time, reminder_opt_in } = parsed.data;
    const start = bruneiSlotInstant(date, start_time);
    if (!start || !generateInteriorRefreshSlots().includes(start_time)) {
      return res.status(400).json({ error: "invalid_slot" });
    }
    const today = bruneiDate();
    if (date <= today) return res.status(400).json({ error: "previous_day_booking_required" });
    if (date > addCalendarDays(today, 30)) return res.status(400).json({ error: "too_far_ahead" });
    const end = new Date(start.getTime() + 45 * 60_000);
    const userId = Number(req.lucia!.user!.id);
    try {
      const booking = await db.transaction(async (tx) => {
        // Serializes all choices for one Tungku day, including different but
        // overlapping 15-minute starts. Unique indexes remain final safeguards.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"interior-refresh:" + date}))`);
        const c = await config(tx);
        if (!c?.branch_id) throw new Error("tungku_not_configured");
        if (!configOpen(c, date)) throw new Error("promotion_unavailable");
        const entitlement = (await tx.execute(sql`
          SELECT e.*, s.id AS sub_id
          FROM interior_refresh_entitlements e
          JOIN subscriptions s ON s.id = e.subscription_id
          JOIN cars owned_car ON owned_car.id = e.vehicle_id
          WHERE s.user_id = ${userId}
            AND owned_car.user_id = ${userId}
            AND s.plan_id IN ('unlimited','family')
            AND s.status IN ('active','past_due')
            AND e.status = 'available'
            AND e.vehicle_id = ${vehicle_id}
            AND now() >= e.period_start AND now() < e.period_end
            AND ${start.toISOString()}::timestamptz >= e.period_start
            AND ${end.toISOString()}::timestamptz <= e.period_end
          ORDER BY e.period_end DESC LIMIT 1
          FOR UPDATE OF e
        `)).rows[0] as any;
        if (!entitlement) throw new Error("no_available_entitlement");
        const collision = (await tx.execute(sql`
          SELECT 1 FROM interior_refresh_bookings
          WHERE branch_id = ${c.branch_id} AND status IN ('booked','checked_in')
            AND slot_start < ${end.toISOString()}::timestamptz
            AND slot_end > ${start.toISOString()}::timestamptz
          LIMIT 1
        `)).rows[0];
        if (collision) throw new Error("slot_unavailable");
        const id = `irb_${randomUUID()}`;
        const row = (await tx.execute(sql`
          INSERT INTO interior_refresh_bookings
            (id, entitlement_id, subscription_id, vehicle_id, branch_id,
             slot_start, slot_end, booked_by_user_id, reminder_opt_in,
             benefit_period_start, benefit_period_end)
          VALUES (${id}, ${entitlement.id}, ${entitlement.sub_id}, ${vehicle_id},
            ${c.branch_id}, ${start.toISOString()}, ${end.toISOString()}, ${userId},
            ${reminder_opt_in}, ${entitlement.period_start}, ${entitlement.period_end})
          RETURNING *
        `)).rows[0];
        const claimed = (await tx.execute(sql`
          UPDATE interior_refresh_entitlements SET status = 'booked'
          WHERE id = ${entitlement.id} AND status = 'available' RETURNING id
        `)).rows;
        if (!claimed.length) throw new Error("no_available_entitlement");
        return row;
      });
      res.status(201).json({ booking });
    } catch (err: any) {
      const code = String(err?.message);
      const known: Record<string, number> = {
        tungku_not_configured: 503, promotion_unavailable: 409,
        no_available_entitlement: 409, vehicle_not_covered: 403, slot_unavailable: 409,
      };
      if (known[code]) return res.status(known[code]).json({ error: code });
      if (err?.code === "23505") return res.status(409).json({ error: "booking_conflict" });
      dbError(res, "book", err);
    }
  });

  // The QR deliberately contains only an opaque booking identifier. It is
  // issued only for a customer-owned appointment; all authority checks occur
  // again when staff scans it.
  app.post("/api/subscriptions/interior-refresh/bookings/:id/qr", requireLuciaUser, async (req, res) => {
    try {
      const booking = (await db.execute(sql`
        SELECT b.id, b.status, b.slot_start, c.license_plate, br.name AS branch_name,
          e.period_end
        FROM interior_refresh_bookings b
        JOIN subscriptions s ON s.id=b.subscription_id
        JOIN interior_refresh_entitlements e ON e.id=b.entitlement_id
        JOIN cars c ON c.id=b.vehicle_id
        JOIN branches br ON br.id=b.branch_id
        WHERE b.id=${req.params.id} AND s.user_id=${Number(req.lucia!.user!.id)}
          AND c.user_id=${Number(req.lucia!.user!.id)}
          AND b.status IN ('booked','checked_in','completed','no_show')
        LIMIT 1
      `)).rows[0] as any;
      if (!booking) return res.status(404).json({ error: "booking_not_found" });
      res.set("Cache-Control", "no-store");
      res.json({
        ok: true,
        voucher: {
          booking_id: booking.id,
          plate: booking.license_plate,
          appointment_at: booking.slot_start,
          branch_name: booking.branch_name,
          period_end: booking.period_end,
          claimed: booking.status !== "booked",
          qr_payload: JSON.stringify({ type: "INTERIOR_REFRESH", booking_id: booking.id }),
        },
      });
    } catch (err) { dbError(res, "booking-qr", err); }
  });

  app.delete("/api/subscriptions/interior-refresh/bookings/:id", requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    try {
      const result = await db.transaction(async (tx) => {
        const b = (await tx.execute(sql`
          SELECT b.* FROM interior_refresh_bookings b
          JOIN subscriptions s ON s.id = b.subscription_id
          JOIN cars c ON c.id = b.vehicle_id
          WHERE b.id = ${req.params.id} AND s.user_id = ${userId}
            AND c.user_id = ${userId}
          FOR UPDATE OF b
        `)).rows[0] as any;
        if (!b) throw new Error("not_found");
        if (b.status !== "booked") throw new Error("cannot_cancel");
        if (new Date(b.slot_start) <= new Date()) throw new Error("cannot_cancel");
        const cancelled = (await tx.execute(sql`
          UPDATE interior_refresh_bookings
          SET status='cancelled', cancelled_at=now(), updated_at=now()
          WHERE id=${b.id} AND status='booked' RETURNING id
        `)).rows;
        if (cancelled.length !== 1) throw new Error("cannot_cancel");
        const restored = (await tx.execute(sql`
          UPDATE interior_refresh_entitlements SET status='available'
          WHERE id=${b.entitlement_id} AND status='booked'
          RETURNING id
        `)).rows;
        if (restored.length !== 1) throw new Error("entitlement_invariant_failed");
        return { id: b.id, status: "cancelled" };
      });
      res.json({ booking: result });
    } catch (err: any) {
      if (err.message === "not_found") return res.status(404).json({ error: "not_found" });
      if (err.message === "cannot_cancel") return res.status(409).json({ error: "cannot_cancel" });
      dbError(res, "cancel", err);
    }
  });

  app.get("/api/staff/interior-refresh/access", requireStaff, async (req, res) => {
    try {
      const c = await config();
      if (!c?.branch_id) return res.status(503).json({ error: "tungku_not_configured" });
      res.set("Cache-Control", "no-store");
      res.json({
        can_manage: staffCanUseTungku(req, Number(c.branch_id)),
        branch: { id: Number(c.branch_id), name: c.branch_name },
      });
    } catch (err) { dbError(res, "staff-access", err); }
  });

  app.get("/api/staff/interior-refresh/schedule", requireStaff, async (req, res) => {
    const date = String(req.query.date ?? bruneiDate());
    if (!isCalendarDate(date)) return res.status(400).json({ error: "invalid_date" });
    try {
      const c = await config();
      if (!c?.branch_id) return res.status(503).json({ error: "tungku_not_configured" });
      if (!staffCanUseTungku(req, Number(c.branch_id))) return res.status(403).json({ error: "tungku_staff_only" });
      const bookings = (await db.execute(sql`
        SELECT b.*, c.license_plate, c.brand, c.model,
          u.first_name, u.last_name, u.phone_number,
          e.period_start AS benefit_period_start,
          e.period_end AS benefit_period_end,
          e.status AS benefit_status,
          s.plan_id
        FROM interior_refresh_bookings b
        JOIN cars c ON c.id=b.vehicle_id
        JOIN subscriptions s ON s.id=b.subscription_id
        JOIN interior_refresh_entitlements e ON e.id=b.entitlement_id
        LEFT JOIN users u ON u.id=s.user_id
        WHERE b.branch_id=${c.branch_id}
          AND (b.slot_start AT TIME ZONE 'Asia/Brunei')::date=${date}::date
        ORDER BY b.slot_start
      `)).rows;
      res.set("Cache-Control", "no-store");
      res.json({ date, timezone: INTERIOR_REFRESH.zone, bookings });
    } catch (err) { dbError(res, "schedule", err); }
  });

  app.get("/api/staff/interior-refresh/calendar", requireStaff, async (req, res) => {
    const month = String(req.query.month ?? bruneiDate().slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: "invalid_month" });
    }
    try {
      const c = await config();
      if (!c?.branch_id) return res.status(503).json({ error: "tungku_not_configured" });
      if (!staffCanUseTungku(req, Number(c.branch_id))) {
        return res.status(403).json({ error: "tungku_staff_only" });
      }
      const days = (await db.execute(sql`
        SELECT
          to_char((b.slot_start AT TIME ZONE 'Asia/Brunei')::date, 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE b.status = 'booked')::int AS booked,
          COUNT(*) FILTER (WHERE b.status = 'checked_in')::int AS checked_in,
          COUNT(*) FILTER (WHERE b.status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE b.status = 'cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE b.status = 'no_show')::int AS no_show
        FROM interior_refresh_bookings b
        WHERE b.branch_id = ${c.branch_id}
          AND (b.slot_start AT TIME ZONE 'Asia/Brunei')::date >= (${month} || '-01')::date
          AND (b.slot_start AT TIME ZONE 'Asia/Brunei')::date
            < ((${month} || '-01')::date + INTERVAL '1 month')
        GROUP BY (b.slot_start AT TIME ZONE 'Asia/Brunei')::date
        ORDER BY (b.slot_start AT TIME ZONE 'Asia/Brunei')::date
      `)).rows;
      const heatmap = (await db.execute(sql`
        SELECT
          EXTRACT(ISODOW FROM b.slot_start AT TIME ZONE 'Asia/Brunei')::int AS day_of_week,
          EXTRACT(HOUR FROM b.slot_start AT TIME ZONE 'Asia/Brunei')::int AS hour,
          COUNT(*)::int AS bookings
        FROM interior_refresh_bookings b
        WHERE b.branch_id = ${c.branch_id}
          AND b.status <> 'cancelled'
          AND (b.slot_start AT TIME ZONE 'Asia/Brunei')::date >= (${month} || '-01')::date
          AND (b.slot_start AT TIME ZONE 'Asia/Brunei')::date
            < ((${month} || '-01')::date + INTERVAL '1 month')
        GROUP BY
          EXTRACT(ISODOW FROM b.slot_start AT TIME ZONE 'Asia/Brunei'),
          EXTRACT(HOUR FROM b.slot_start AT TIME ZONE 'Asia/Brunei')
        ORDER BY day_of_week, hour
      `)).rows;
      res.set("Cache-Control", "no-store");
      res.json({ month, timezone: INTERIOR_REFRESH.zone, days, heatmap });
    } catch (err) { dbError(res, "calendar", err); }
  });

  const statusSchema = z.object({ status: z.enum(["checked_in", "completed", "cancelled", "no_show"]) });
  app.patch("/api/staff/interior-refresh/bookings/:id/status", requireStaff, async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_status" });
    const next = parsed.data.status;
    const staffId = String(req.staff!.user!.id);
    try {
      const row = await db.transaction(async (tx) => {
        const c = await config(tx);
        if (!c?.branch_id) throw new Error("tungku_not_configured");
        if (!staffCanUseTungku(req, Number(c.branch_id))) throw new Error("tungku_staff_only");
        if (next === "checked_in") throw new Error("qr_scan_required");
        const b = (await tx.execute(sql`
          SELECT b.*, c.license_plate, s.user_id, br.name AS branch_name
          FROM interior_refresh_bookings b
          JOIN cars c ON c.id=b.vehicle_id JOIN subscriptions s ON s.id=b.subscription_id
          JOIN branches br ON br.id=b.branch_id
          WHERE b.id=${req.params.id} AND b.branch_id=${c.branch_id}
          FOR UPDATE OF b
        `)).rows[0] as any;
        if (!b) throw new Error("not_found");
        const allowed =
          (b.status === "booked" && ["cancelled", "no_show"].includes(next)) ||
          (b.status === "checked_in" && next === "completed");
        if (!allowed) throw new Error("invalid_transition");
        const slotEnd = new Date(b.slot_end);
        if (next === "no_show" && slotEnd > new Date()) {
          throw new Error("no_show_too_early");
        }

        if (next === "no_show") {
          const consumed = (await tx.execute(sql`
            UPDATE interior_refresh_entitlements
            SET status='used', consumed_at=now()
            WHERE id=${b.entitlement_id} AND status='booked' RETURNING id
          `)).rows;
          if (!consumed.length) throw new Error("benefit_already_consumed");
        } else if (next === "cancelled" && b.status === "booked") {
          await tx.execute(sql`
            UPDATE interior_refresh_entitlements SET status='available'
            WHERE id=${b.entitlement_id} AND status='booked'
          `);
        }

        let serviceId = b.service_history_id;
        if (serviceId && next === "completed") {
          await tx.execute(sql`
            UPDATE service_history SET status='completed', completed_time=now()
            WHERE id=${serviceId}
          `);
        } else if (serviceId && next === "cancelled") {
          await tx.execute(sql`
            UPDATE service_history SET status='cancelled'
            WHERE id=${serviceId}
          `);
        }
        const timeColumn = next === "completed" ? sql`completed_at`
          : next === "cancelled" ? sql`cancelled_at` : sql`no_show_at`;
        return (await tx.execute(sql`
          UPDATE interior_refresh_bookings SET status=${next}, ${timeColumn}=now(),
            updated_by_staff_id=${staffId}, service_history_id=${serviceId ?? null}, updated_at=now()
          WHERE id=${b.id} RETURNING *
        `)).rows[0];
      });
      res.json({ booking: row });
    } catch (err: any) {
      const code = String(err?.message);
      if (code === "not_found") return res.status(404).json({ error: code });
      if (["invalid_transition", "benefit_already_consumed", "qr_scan_required", "no_show_too_early"].includes(code)) {
        return res.status(409).json({
          error: code,
          ...(code === "qr_scan_required"
            ? { message: "Scan the customer's Interior Refresh QR to check in" }
            : {}),
        });
      }
      if (code === "tungku_staff_only") return res.status(403).json({ error: code });
      if (code === "tungku_not_configured") return res.status(503).json({ error: code });
      dbError(res, "status", err);
    }
  });

  app.get("/api/admin/interior-refresh/config", requireStaff, requireStaffRole("owner"), async (_req, res) => {
    try { res.json({ promotion: await config() }); } catch (err) { dbError(res, "admin-config", err); }
  });
  app.put("/api/admin/interior-refresh/config", requireStaff, requireStaffRole("owner"), async (req, res) => {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_config", details: parsed.error.flatten().fieldErrors });
    try {
      const p = (await db.execute(sql`
        UPDATE interior_refresh_promotion
        SET enabled=${parsed.data.enabled}, starts_on=${parsed.data.starts_on ?? null},
            ends_on=${parsed.data.ends_on ?? null},
            updated_by_staff_id=${String(req.staff!.user!.id)}, updated_at=now()
        WHERE id=${INTERIOR_REFRESH.id} RETURNING *
      `)).rows[0];
      res.json({ promotion: p });
    } catch (err) { dbError(res, "admin-config-update", err); }
  });

  app.get("/api/admin/interior-refresh/report", requireStaff, requireStaffRole("owner"), async (req, res) => {
    const from = String(req.query.from ?? addCalendarDays(bruneiDate(), -30));
    const to = String(req.query.to ?? bruneiDate());
    if (!isCalendarDate(from) || !isCalendarDate(to) || to < from) return res.status(400).json({ error: "invalid_date_range" });
    try {
      const totals = (await db.execute(sql`
        SELECT count(*)::int AS bookings,
          count(*) FILTER (WHERE status='completed')::int AS completed,
          count(*) FILTER (WHERE status='cancelled')::int AS cancellations,
          count(*) FILTER (WHERE status='no_show')::int AS no_shows,
          count(*) FILTER (WHERE status='checked_in')::int AS checked_in
        FROM interior_refresh_bookings
        WHERE (slot_start AT TIME ZONE 'Asia/Brunei')::date BETWEEN ${from}::date AND ${to}::date
      `)).rows[0];
      const cycles = (await db.execute(sql`
        SELECT count(*)::int AS paid_cycles,
          count(*) FILTER (WHERE status='used')::int AS used,
          count(*) FILTER (WHERE status='booked')::int AS booked,
          count(*) FILTER (WHERE status='available' AND period_end > now())::int AS available,
          count(*) FILTER (WHERE status='available' AND period_end <= now())::int AS expired
        FROM interior_refresh_entitlements
        WHERE (period_start AT TIME ZONE 'Asia/Brunei')::date <= ${to}::date
          AND (period_end AT TIME ZONE 'Asia/Brunei')::date >= ${from}::date
      `)).rows[0];
      const bookings = (await db.execute(sql`
        SELECT b.id, b.status, b.slot_start, b.slot_end, b.created_at,
          c.license_plate, c.brand, c.model,
          u.first_name, u.last_name, s.plan_id,
          e.period_start, e.period_end
        FROM interior_refresh_bookings b
        JOIN cars c ON c.id=b.vehicle_id
        JOIN subscriptions s ON s.id=b.subscription_id
        JOIN interior_refresh_entitlements e ON e.id=b.entitlement_id
        LEFT JOIN users u ON u.id=s.user_id
        WHERE (b.slot_start AT TIME ZONE 'Asia/Brunei')::date
          BETWEEN ${from}::date AND ${to}::date
        ORDER BY b.slot_start DESC
      `)).rows;
      res.json({ from, to, totals, cycles, bookings });
    } catch (err) { dbError(res, "report", err); }
  });
}