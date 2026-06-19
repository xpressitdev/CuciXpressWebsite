// ============================================================================
// server/subscriptions.ts
//
// Auto-renewing subscription routes + the monthly renewal worker.
//
// A paid subscription MAINTAINS an `unlimited` membership (membership.source =
// 'subscription', expires_at = current_period_end). Nothing about the lane scan
// / QR redemption flow changes — it already honours active unlimited
// memberships. When a renewal succeeds we push the membership's expires_at
// forward; when it lapses the existing lazy-expiry sweep retires it.
//
// Money is always server-authoritative: the price comes from
// shared/subscriptionPlans.ts, never from the client.
// ============================================================================

import type { Express } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { requireLuciaUser } from "./auth/middleware";
import {
  isCyberSourceConfigured,
  generateCaptureContext,
  createPaymentWithTransientToken,
  chargeStoredInstrument,
} from "./cybersource";
import { getSubscriptionPlan } from "@shared/subscriptionPlans";
import { processPocketPayPayment } from "./payment";

// Renewal worker tuning.
const POLL_INTERVAL_MS = 15 * 60_000; // every 15 minutes
const LEASE_SECONDS = 600; // hide a claimed sub for 10 min while we charge it
const RETRY_BACKOFF_SECONDS = 24 * 3600; // retry a failed charge in ~1 day
const MAX_FAILED_ATTEMPTS = 4; // after this many failures, cancel the sub

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** True when a DB error is a Postgres unique-constraint violation (23505). */
function isUniqueViolation(err: any): boolean {
  return (
    err?.code === "23505" ||
    /duplicate key|unique constraint/i.test(String(err?.message ?? ""))
  );
}

/**
 * Plate normalisation — must match the cars_plate_normalized_unique index:
 * UPPERCASE, all whitespace stripped.
 */
function normalizePlate(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}

/**
 * Resolve (or create) the car for a plate, bound to this customer, inside a
 * transaction. Mirrors the POS / garage claim-on-login pattern so the per-car
 * unlimited membership can point at a real vehicle_id:
 *   1. CLAIM an existing unclaimed car (walk-in created at the POS) atomically.
 *   2. Otherwise reuse a car this customer/user already owns.
 *   3. Otherwise INSERT a fresh car.
 * The plate string is matched normalised; cars_plate_normalized_unique
 * guarantees at most one row per plate. Returns the car id.
 */
async function resolveCarId(
  tx: any,
  opts: { userId: number | null; customerId: number; plate: string },
): Promise<number> {
  const { userId, customerId, plate } = opts;
  const plateNorm = normalizePlate(plate);

  // 1. Claim an unclaimed car for this plate.
  const claimed = (await tx.execute(sql`
    UPDATE cars SET
      user_id     = COALESCE(user_id, ${userId}),
      customer_id = ${customerId},
      last_seen_at = now()
    WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
      AND user_id IS NULL AND customer_id IS NULL
    RETURNING id
  `)).rows[0] as any;
  if (claimed) return Number(claimed.id);

  // 2. Reuse a car this customer/user already owns.
  const owned = (await tx.execute(sql`
    SELECT id FROM cars
     WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
       AND (customer_id = ${customerId}
            ${userId !== null ? sql`OR user_id = ${userId}` : sql``})
     LIMIT 1
  `)).rows[0] as any;
  if (owned) return Number(owned.id);

  // 3. Insert a fresh car. A 23505 here means a concurrent writer created it
  //    between our checks; re-resolve deterministically.
  try {
    const inserted = (await tx.execute(sql`
      INSERT INTO cars (user_id, customer_id, license_plate, last_seen_at)
      VALUES (${userId}, ${customerId}, ${plate}, now())
      RETURNING id
    `)).rows[0] as any;
    return Number(inserted.id);
  } catch (err: any) {
    if (!isUniqueViolation(err)) throw err;
    const again = (await tx.execute(sql`
      SELECT id FROM cars
       WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
       LIMIT 1
    `)).rows[0] as any;
    if (again) return Number(again.id);
    throw err;
  }
}

/** Add one calendar month (clamps to month length, e.g. Jan 31 -> Feb 28). */
function addOneMonth(from: Date): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() < day) d.setDate(0); // overflowed into next month -> last day
  return d;
}

function requestOrigin(req: any): string {
  const host = req.get("host");
  const proto =
    (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ||
    req.protocol ||
    "https";
  return `${proto}://${host}`;
}

/**
 * Ensure a customers row exists for this Lucia user and return its id.
 * Claim-on-login pattern: adopt an unclaimed row with the same phone rather
 * than colliding with the unique phone constraint. Throws
 * "phone_belongs_to_other_customer" if the phone is already tied to a
 * different account.
 */
async function resolveCustomerId(userId: number, phone: string): Promise<number> {
  const byUser = (await db.execute(sql`
    SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1
  `)).rows[0] as any;
  if (byUser) return Number(byUser.id);

  const byPhone = (await db.execute(sql`
    SELECT id, user_id FROM customers WHERE phone = ${phone} LIMIT 1
  `)).rows[0] as any;
  if (byPhone && byPhone.user_id == null) {
    await db.execute(sql`
      UPDATE customers SET user_id = ${userId}, updated_at = now() WHERE id = ${byPhone.id}
    `);
    return Number(byPhone.id);
  }
  if (byPhone && Number(byPhone.user_id) === userId) return Number(byPhone.id);
  if (byPhone) throw new Error("phone_belongs_to_other_customer");

  const uname = (await db.execute(sql`
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Member') AS name
      FROM users WHERE id = ${userId} LIMIT 1
  `)).rows[0] as any;
  const inserted = (await db.execute(sql`
    INSERT INTO customers (phone, name, user_id)
    VALUES (${phone}, ${uname?.name ?? "Member"}, ${userId})
    RETURNING id
  `)).rows[0] as any;
  return Number(inserted.id);
}

/**
 * Finalize a ONE-TIME Pocket Pay subscription purchase. Called by the Pocket
 * Pay payment callback with the gateway order_id. Looks up the pending
 * ('incomplete') subscription created at checkout-start, promotes it to
 * 'active', and creates the 1-month unlimited membership + a paid invoice.
 *
 * No auto-renew: the row keeps cancel_at_period_end = true (set at start), so
 * the existing renewal worker retires it at period end.
 *
 * Idempotent + concurrency-safe: the row is claimed with an atomic
 * UPDATE ... WHERE status = 'incomplete'. A re-delivered callback finds 0 rows
 * and rolls back, so no second membership/invoice is ever created. Returns
 * false when there is no matching pending subscription (e.g. a single-wash
 * order callback, or an already-finalized subscription).
 */
export async function activatePocketPaySubscription(
  pocketPayOrderId: string,
): Promise<boolean> {
  const row = (await db.execute(sql`
    SELECT id, user_id, customer_id, price_cents, currency, car_plate
      FROM subscriptions
     WHERE pocket_pay_ref = ${pocketPayOrderId}
       AND payment_provider = 'pocket_pay'
       AND status = 'incomplete'
     LIMIT 1
  `)).rows[0] as any;
  if (!row) return false;

  const subId = String(row.id);
  const userId = row.user_id != null ? Number(row.user_id) : null;
  const now = new Date();
  const periodEnd = addOneMonth(now);

  // The plate(s) this subscription is for (per-car unlimited memberships).
  const plates = Array.from(
    new Set(
      String(row.car_plate ?? "")
        .split(",")
        .map((p: string) => normalizePlate(p))
        .filter(Boolean),
    ),
  ) as string[];

  try {
    await db.transaction(async (tx) => {
      // Atomically claim the row: only the first finalization flips it out of
      // 'incomplete'. A re-delivered callback gets 0 rows and rolls back.
      const claimed = (await tx.execute(sql`
        UPDATE subscriptions
           SET status = 'active',
               current_period_start = ${now.toISOString()},
               current_period_end = ${periodEnd.toISOString()},
               next_billing_at = ${periodEnd.toISOString()},
               cancel_at_period_end = true,
               failed_attempts = 0,
               updated_at = now()
         WHERE id = ${subId} AND status = 'incomplete'
        RETURNING id
      `)).rows;
      if (claimed.length === 0) throw new Error("ALREADY_FINALIZED");

      // Create one per-CAR unlimited membership for each plate. The B$39
      // Unlimited wash is tied to a specific vehicle; Family covers several.
      // Insert the membership(s) FIRST (the FK subscriptions.membership_id ->
      // memberships.id is checked immediately), then point the subscription at
      // the primary (first) one.
      // One payment funds the whole plan, so attribute its full value to the
      // PRIMARY (first) membership and B$0 to the extra Family cars. This keeps
      // SUM(memberships.price_cents) == the single amount paid, so revenue and
      // liability reports don't multiply by the number of cars.
      let primaryMembershipId: string | null = null;
      for (const plate of plates) {
        const vehicleId = await resolveCarId(tx, {
          userId,
          customerId: Number(row.customer_id),
          plate,
        });
        const membershipId = genId("mem");
        const memberPrice = primaryMembershipId === null ? row.price_cents : 0;
        await tx.execute(sql`
          INSERT INTO memberships (
            id, customer_id, vehicle_id, kind, total_washes, remaining_washes,
            price_cents, status, source, expires_at, sold_by_staff_id, sold_at_branch_id
          ) VALUES (
            ${membershipId}, ${row.customer_id}, ${vehicleId}, 'unlimited', 0, 0,
            ${memberPrice}, 'active', 'subscription', ${periodEnd.toISOString()}, NULL, NULL
          )
        `);
        if (primaryMembershipId === null) primaryMembershipId = membershipId;
      }
      if (primaryMembershipId === null) {
        // Should never happen: the start route requires at least one plate.
        throw new Error("NO_PLATES");
      }
      await tx.execute(sql`
        UPDATE subscriptions SET membership_id = ${primaryMembershipId}, updated_at = now()
         WHERE id = ${subId}
      `);
      await tx.execute(sql`
        INSERT INTO subscription_invoices (
          id, subscription_id, amount_cents, currency, status,
          period_start, period_end
        ) VALUES (
          ${genId("inv")}, ${subId}, ${row.price_cents}, ${row.currency}, 'paid',
          ${now.toISOString()}, ${periodEnd.toISOString()}
        )
      `);
    });
    console.log(
      `[subscriptions.pocketpay] activated ${subId} from order ${pocketPayOrderId}`,
    );
    return true;
  } catch (err: any) {
    if (String(err?.message) === "ALREADY_FINALIZED") return false;
    console.error("[subscriptions.pocketpay] finalize failed:", err?.message ?? err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSubscriptionRoutes(app: Express) {
  // ---- POST /api/subscriptions/capture-context --------------------------
  // Returns the Unified Checkout capture-context JWT for the chosen plan.
  const captureSchema = z.object({ plan_id: z.string() });

  app.post(
    "/api/subscriptions/capture-context",
    requireLuciaUser,
    async (req, res) => {
      if (!isCyberSourceConfigured()) {
        return res.status(503).json({ error: "payments_unavailable" });
      }
      const parsed = captureSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid_request" });

      const plan = getSubscriptionPlan(parsed.data.plan_id);
      if (!plan) return res.status(400).json({ error: "unknown_plan" });

      const userId = Number(req.lucia!.user!.id);
      const existing = (await db.execute(sql`
        SELECT id FROM subscriptions
         WHERE user_id = ${userId} AND status IN ('active','past_due')
         LIMIT 1
      `)).rows[0];
      if (existing) return res.status(409).json({ error: "already_subscribed" });

      try {
        const captureContext = await generateCaptureContext({
          amountCents: plan.priceCents,
          currency: plan.currency,
          targetOrigin: requestOrigin(req),
        });
        res.json({
          captureContext,
          plan: {
            id: plan.id,
            name: plan.name,
            priceCents: plan.priceCents,
            currency: plan.currency,
          },
        });
      } catch (err: any) {
        console.error("[subscriptions.capture-context] failed:", err?.message ?? err);
        res.status(502).json({ error: "capture_context_failed" });
      }
    },
  );

  // ---- POST /api/subscriptions/confirm ----------------------------------
  // Charges the first month, stores the card token, then persists the
  // subscription + its maintaining membership atomically.
  const confirmSchema = z.object({
    plan_id: z.string(),
    transientToken: z.string().min(10),
    phone: z.string().trim().min(3).max(40),
  });

  app.post("/api/subscriptions/confirm", requireLuciaUser, async (req, res) => {
    if (!isCyberSourceConfigured()) {
      return res.status(503).json({ error: "payments_unavailable" });
    }
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_request",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const plan = getSubscriptionPlan(parsed.data.plan_id);
    if (!plan) return res.status(400).json({ error: "unknown_plan" });

    const userId = Number(req.lucia!.user!.id);
    const phone = parsed.data.phone.replace(/\s+/g, "");

    const now = new Date();
    const periodEnd = addOneMonth(now);
    const membershipId = genId("mem");
    const subId = genId("sub");

    // 1. CLAIM a slot BEFORE charging. Insert an 'incomplete' subscription row;
    //    the partial unique index `subscriptions_one_live_per_user` rejects a
    //    second live/in-flight subscription for the same user. This is what
    //    makes a duplicate / concurrent confirm fail WITHOUT a second charge.
    //    First clear out any abandoned (>15m old) incomplete attempts so a
    //    stale checkout doesn't permanently lock the user out.
    try {
      await db.execute(sql`
        DELETE FROM subscriptions
         WHERE user_id = ${userId} AND status = 'incomplete'
           AND created_at < now() - interval '15 minutes'
      `);
      await db.execute(sql`
        INSERT INTO subscriptions (
          id, user_id, plan_id, status, price_cents, currency,
          current_period_start, current_period_end, next_billing_at
        ) VALUES (
          ${subId}, ${userId}, ${plan.id}, 'incomplete',
          ${plan.priceCents}, ${plan.currency},
          ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()}
        )
      `);
    } catch (err: any) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "already_subscribed" });
      }
      console.error("[subscriptions.confirm] claim error:", err?.message ?? err);
      return res.status(500).json({ error: "claim_failed" });
    }

    const releaseClaim = async () => {
      try {
        await db.execute(sql`
          DELETE FROM subscriptions WHERE id = ${subId} AND status = 'incomplete'
        `);
      } catch (e: any) {
        console.error("[subscriptions.confirm] failed to release claim", e?.message ?? e);
      }
    };

    // 2. Charge the first month + create the stored card token. (External call
    //    kept outside the DB transaction.) On any failure we release the claim
    //    so the customer can retry.
    let pay;
    try {
      pay = await createPaymentWithTransientToken({
        transientTokenJwt: parsed.data.transientToken,
        amountCents: plan.priceCents,
        currency: plan.currency,
        referenceCode: subId,
      });
    } catch (err: any) {
      console.error("[subscriptions.confirm] charge error:", err?.message ?? err);
      await releaseClaim();
      return res.status(502).json({ error: "payment_error" });
    }
    if (!pay.ok) {
      await releaseClaim();
      return res
        .status(402)
        .json({ error: "payment_declined", status: pay.status });
    }

    // Auto-renew REQUIRES a stored card token. If CyberSource didn't return one
    // we must not create a recurring subscription. The card was charged, so log
    // loudly for manual reconciliation/refund and keep the (now non-renewable)
    // incomplete row as the audit trail rather than silently enrolling them.
    if (!pay.instrumentId) {
      console.error(
        "[subscriptions.confirm] CHARGED but no stored instrument returned — " +
          "cannot enrol auto-renew; needs manual reconciliation",
        { userId, subId, paymentId: pay.id },
      );
      await db.execute(sql`
        UPDATE subscriptions SET status = 'incomplete', updated_at = now()
         WHERE id = ${subId}
      `);
      return res.status(502).json({ error: "card_not_storable", paymentId: pay.id });
    }

    // 3. Promote the claimed row to 'active' and persist everything atomically.
    try {
      await db.transaction(async (tx) => {
        // Ensure a customers row exists for this user (claim-on-login pattern:
        // adopt an unclaimed row with the same phone rather than colliding with
        // the unique phone constraint).
        let customerId: number | null = null;
        const byUser = (await tx.execute(sql`
          SELECT id FROM customers WHERE user_id = ${userId} LIMIT 1
        `)).rows[0] as any;
        if (byUser) {
          customerId = Number(byUser.id);
        } else {
          const byPhone = (await tx.execute(sql`
            SELECT id, user_id FROM customers WHERE phone = ${phone} LIMIT 1
          `)).rows[0] as any;
          if (byPhone && byPhone.user_id == null) {
            await tx.execute(sql`
              UPDATE customers SET user_id = ${userId}, updated_at = now()
               WHERE id = ${byPhone.id}
            `);
            customerId = Number(byPhone.id);
          } else if (byPhone && Number(byPhone.user_id) === userId) {
            customerId = Number(byPhone.id);
          } else if (byPhone) {
            throw new Error("phone_belongs_to_other_customer");
          } else {
            const uname = (await tx.execute(sql`
              SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''),
                              'Member') AS name
                FROM users WHERE id = ${userId} LIMIT 1
            `)).rows[0] as any;
            const inserted = (await tx.execute(sql`
              INSERT INTO customers (phone, name, user_id)
              VALUES (${phone}, ${uname?.name ?? "Member"}, ${userId})
              RETURNING id
            `)).rows[0] as any;
            customerId = Number(inserted.id);
          }
        }

        // The unlimited membership the subscription maintains.
        await tx.execute(sql`
          INSERT INTO memberships (
            id, customer_id, vehicle_id, kind, total_washes, remaining_washes,
            price_cents, status, source, expires_at, sold_by_staff_id, sold_at_branch_id
          ) VALUES (
            ${membershipId}, ${customerId}, NULL, 'unlimited', 0, 0,
            ${plan.priceCents}, 'active', 'subscription', ${periodEnd.toISOString()}, NULL, NULL
          )
        `);

        // Promote the claimed 'incomplete' row to a live subscription.
        await tx.execute(sql`
          UPDATE subscriptions SET
            customer_id = ${customerId},
            status = 'active',
            cybersource_customer_id = ${pay.customerId ?? null},
            cybersource_instrument_id = ${pay.instrumentId ?? null},
            initial_transaction_id = ${pay.id ?? null},
            card_brand = ${pay.cardBrand ?? null},
            card_last4 = ${pay.cardLast4 ?? null},
            current_period_start = ${now.toISOString()},
            current_period_end = ${periodEnd.toISOString()},
            next_billing_at = ${periodEnd.toISOString()},
            membership_id = ${membershipId},
            failed_attempts = 0,
            updated_at = now()
           WHERE id = ${subId}
        `);

        await tx.execute(sql`
          INSERT INTO subscription_invoices (
            id, subscription_id, amount_cents, currency, status,
            cybersource_payment_id, period_start, period_end
          ) VALUES (
            ${genId("inv")}, ${subId}, ${plan.priceCents}, ${plan.currency}, 'paid',
            ${pay.id ?? null}, ${now.toISOString()}, ${periodEnd.toISOString()}
          )
        `);
      });
    } catch (err: any) {
      // The card WAS charged but we failed to persist. Log loudly for manual
      // reconciliation rather than silently swallowing.
      console.error(
        "[subscriptions.confirm] PERSIST FAILED after successful charge",
        { userId, paymentId: pay.id, err: err?.message ?? err },
      );
      if (String(err?.message) === "phone_belongs_to_other_customer") {
        return res.status(409).json({ error: "phone_in_use" });
      }
      return res.status(500).json({ error: "persist_failed", paymentId: pay.id });
    }

    res.status(201).json({
      ok: true,
      subscription: {
        id: subId,
        plan_id: plan.id,
        status: "active",
        current_period_end: periodEnd.toISOString(),
        card_brand: pay.cardBrand,
        card_last4: pay.cardLast4,
      },
    });
  });

  // ---- POST /api/subscriptions/pocketpay/start --------------------------
  // ONE-TIME Pocket Pay subscription purchase (no auto-renew). Creates a
  // pending ('incomplete') subscription, then a Pocket Pay payment link.
  // The payment callback finalizes it via activatePocketPaySubscription().
  const ppStartSchema = z.object({
    plan_id: z.string(),
    phone: z.string().trim().min(3).max(40),
    // Plate(s) the membership is for. Unlimited = 1 car; Family = up to 3
    // (comma-separated). Required: every membership must bind to a vehicle or
    // the lane redemption flow rejects it (`membership_no_vehicle`).
    car_plate: z.string().trim().min(1).max(120),
  });

  app.post(
    "/api/subscriptions/pocketpay/start",
    requireLuciaUser,
    async (req, res) => {
      const parsed = ppStartSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "invalid_request",
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const plan = getSubscriptionPlan(parsed.data.plan_id);
      if (!plan) return res.status(400).json({ error: "unknown_plan" });

      const userId = Number(req.lucia!.user!.id);
      const phone = parsed.data.phone.replace(/\s+/g, "");

      // The membership is per-CAR. Split the (comma-separated) plates, normalise
      // them, and de-duplicate. Unlimited covers 1 car; Family up to maxVehicles.
      const plates = Array.from(
        new Set(
          parsed.data.car_plate
            .split(",")
            .map((p) => normalizePlate(p))
            .filter(Boolean),
        ),
      );
      if (plates.length === 0) {
        return res.status(400).json({ error: "plate_required" });
      }
      if (plates.length > plan.maxVehicles) {
        return res.status(400).json({
          error: "too_many_plates",
          max: plan.maxVehicles,
        });
      }

      // Already have a live subscription? Don't let them pay twice.
      const existing = (await db.execute(sql`
        SELECT id FROM subscriptions
         WHERE user_id = ${userId} AND status IN ('active','past_due')
         LIMIT 1
      `)).rows[0];
      if (existing) return res.status(409).json({ error: "already_subscribed" });

      // Resolve/create the customers row UP FRONT so the callback can finalize
      // without needing the phone again.
      let customerId: number;
      try {
        customerId = await resolveCustomerId(userId, phone);
      } catch (err: any) {
        if (String(err?.message) === "phone_belongs_to_other_customer") {
          return res.status(409).json({ error: "phone_in_use" });
        }
        console.error(
          "[subscriptions.pocketpay.start] customer resolve failed:",
          err?.message ?? err,
        );
        return res.status(500).json({ error: "customer_resolve_failed" });
      }

      // Don't let a customer pay for a plate that already belongs to a DIFFERENT
      // account — the finalizer could not claim it, and binding a membership to
      // someone else's car would be wrong. Unclaimed and own-cars are fine.
      const platesSql = sql.join(plates.map((p) => sql`${p}`), sql`, `);
      const foreignPlate = (await db.execute(sql`
        SELECT license_plate FROM cars
         WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) IN (${platesSql})
           AND (
                (user_id IS NOT NULL AND user_id <> ${userId})
             OR (customer_id IS NOT NULL AND customer_id <> ${customerId})
           )
         LIMIT 1
      `)).rows[0] as any;
      if (foreignPlate) {
        return res.status(409).json({
          error: "plate_in_use",
          plate: foreignPlate.license_plate,
        });
      }

      const carPlate = plates[0];
      const carPlateStored = plates.join(",");

      const now = new Date();
      const subId = genId("sub");

      // Claim a slot BEFORE creating the payment. The partial unique index
      // `subscriptions_one_live_per_user` (covers 'incomplete') makes a
      // duplicate/concurrent start fail without creating a second payment.
      // Clear abandoned (>15m) incompletes first so a stale attempt doesn't
      // permanently lock the user out.
      try {
        await db.execute(sql`
          DELETE FROM subscriptions
           WHERE user_id = ${userId} AND status = 'incomplete'
             AND created_at < now() - interval '15 minutes'
        `);
        await db.execute(sql`
          INSERT INTO subscriptions (
            id, user_id, customer_id, plan_id, status, price_cents, currency,
            payment_provider, car_plate, cancel_at_period_end,
            current_period_start, current_period_end, next_billing_at
          ) VALUES (
            ${subId}, ${userId}, ${customerId}, ${plan.id}, 'incomplete',
            ${plan.priceCents}, ${plan.currency}, 'pocket_pay', ${carPlateStored}, true,
            ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()}
          )
        `);
      } catch (err: any) {
        if (isUniqueViolation(err)) {
          return res.status(409).json({ error: "already_subscribed" });
        }
        console.error(
          "[subscriptions.pocketpay.start] claim error:",
          err?.message ?? err,
        );
        return res.status(500).json({ error: "claim_failed" });
      }

      const releaseClaim = async () => {
        try {
          await db.execute(sql`
            DELETE FROM subscriptions WHERE id = ${subId} AND status = 'incomplete'
          `);
        } catch (e: any) {
          console.error(
            "[subscriptions.pocketpay.start] failed to release claim",
            e?.message ?? e,
          );
        }
      };

      // Create the Pocket Pay payment link.
      let pay: any;
      try {
        pay = await processPocketPayPayment({
          serviceName: `${plan.name} — 1 month`,
          amount: plan.priceCents / 100,
          carPlate: carPlate || "SUBSCRIPTION",
          phone,
          selectedBranch: "Online",
          returnPath: "/subscription-success",
        });
      } catch (err: any) {
        console.error(
          "[subscriptions.pocketpay.start] payment error:",
          err?.message ?? err,
        );
        await releaseClaim();
        return res.status(502).json({ error: "payment_error" });
      }
      if (!pay?.success || !pay.payment_url || !pay.order_id) {
        await releaseClaim();
        return res
          .status(502)
          .json({ error: "payment_error", message: pay?.message });
      }

      // Store the Pocket Pay order_id + success_indicator so the callback can
      // both find this sub (by ref) and authenticate itself (by indicator).
      await db.execute(sql`
        UPDATE subscriptions
           SET pocket_pay_ref = ${String(pay.order_id)},
               pocket_pay_success_indicator = ${pay.success_indicator ?? null},
               updated_at = now()
         WHERE id = ${subId}
      `);

      // NOTE: success_indicator is deliberately NOT returned to the client. It
      // is the per-order token Pocket Pay echoes in the callback, and we match
      // it server-side to authenticate the callback. Exposing it pre-payment
      // would let a caller forge a "paid" callback without paying.
      res.json({
        ok: true,
        redirect_url: pay.payment_url,
        qr_code: pay.qr_code ?? null,
        order_id: pay.order_id,
      });
    },
  );

  // ---- GET /api/subscriptions/me ----------------------------------------
  app.get("/api/subscriptions/me", requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    const row = (await db.execute(sql`
      SELECT id, plan_id, status, price_cents, currency, card_brand, card_last4,
             current_period_end, next_billing_at, cancel_at_period_end, created_at
        FROM subscriptions
       WHERE user_id = ${userId}
       ORDER BY created_at DESC
       LIMIT 1
    `)).rows[0] ?? null;
    res.json({ subscription: row });
  });

  // ---- POST /api/subscriptions/:id/cancel -------------------------------
  // Soft cancel: keep access until the end of the paid period, stop renewing.
  app.post("/api/subscriptions/:id/cancel", requireLuciaUser, async (req, res) => {
    const userId = Number(req.lucia!.user!.id);
    const id = String(req.params.id);
    const row = (await db.execute(sql`
      SELECT id, user_id, status FROM subscriptions WHERE id = ${id} LIMIT 1
    `)).rows[0] as any;
    if (!row || Number(row.user_id) !== userId) {
      return res.status(404).json({ error: "not_found" });
    }
    if (row.status === "cancelled") {
      return res.json({ ok: true, status: "cancelled" });
    }
    await db.execute(sql`
      UPDATE subscriptions
         SET cancel_at_period_end = true, updated_at = now()
       WHERE id = ${id}
    `);
    res.json({ ok: true, cancel_at_period_end: true });
  });
}

// ---------------------------------------------------------------------------
// Renewal worker
// ---------------------------------------------------------------------------

let workerStarted = false;
let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Charge every subscription whose next_billing_at is due. Claims rows by
 * leasing next_billing_at forward so two passes (timer overlap / two instances)
 * never double-charge the same subscription.
 */
export async function renewDueOnce(): Promise<{ charged: number; failed: number }> {
  if (!isCyberSourceConfigured()) return { charged: 0, failed: 0 };

  const claim = await db.execute(sql`
    UPDATE subscriptions
       SET next_billing_at = now() + (${LEASE_SECONDS}::int * interval '1 second'),
           updated_at = now()
     WHERE id IN (
       SELECT id FROM subscriptions
        WHERE status IN ('active','past_due')
          AND next_billing_at <= now()
        ORDER BY next_billing_at ASC
        LIMIT 20
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, plan_id, price_cents, currency, cybersource_instrument_id,
              initial_transaction_id, current_period_end, cancel_at_period_end,
              failed_attempts, membership_id
  `);
  const due = claim.rows as any[];
  if (due.length === 0) return { charged: 0, failed: 0 };

  let charged = 0;
  let failed = 0;

  for (const s of due) {
    try {
      // Scheduled to end and the customer cancelled -> retire it, no charge.
      if (s.cancel_at_period_end) {
        await db.execute(sql`
          UPDATE subscriptions SET status = 'cancelled', updated_at = now()
           WHERE id = ${s.id}
        `);
        if (s.membership_id) {
          await db.execute(sql`
            UPDATE memberships SET status = 'expired'
             WHERE id = ${s.membership_id} AND status = 'active'
          `);
        }
        continue;
      }

      // No stored card -> cannot auto-renew. Cancel.
      if (!s.cybersource_instrument_id) {
        await db.execute(sql`
          UPDATE subscriptions SET status = 'cancelled', updated_at = now()
           WHERE id = ${s.id}
        `);
        continue;
      }

      // Periods are contiguous and DERIVED from the row (not from now()), so the
      // (subscription_id, period_end) pair is identical across every retry /
      // restart for the same billing period — this is what makes the idempotency
      // anchor below stable.
      const periodStart = new Date(s.current_period_end);
      const periodEnd = addOneMonth(periodStart);

      // IDEMPOTENCY ANCHOR: claim this period with a 'pending' invoice BEFORE
      // charging. If a prior pass already inserted a pending/paid invoice for
      // this exact period (e.g. it charged then crashed before advancing the
      // subscription), this insert hits the partial unique index and we SKIP
      // rather than charge a second time.
      const invId = genId("inv");
      try {
        await db.execute(sql`
          INSERT INTO subscription_invoices (
            id, subscription_id, amount_cents, currency, status,
            period_start, period_end
          ) VALUES (
            ${invId}, ${s.id}, ${s.price_cents}, ${s.currency}, 'pending',
            ${periodStart.toISOString()}, ${periodEnd.toISOString()}
          )
        `);
      } catch (err: any) {
        if (isUniqueViolation(err)) {
          console.error(
            "[subscriptions.renew] period already has a pending/paid invoice — " +
              "skipping to avoid a double-charge; needs reconciliation",
            { sub: s.id, periodEnd: periodEnd.toISOString() },
          );
          continue;
        }
        throw err;
      }

      const result = await chargeStoredInstrument({
        instrumentId: s.cybersource_instrument_id,
        amountCents: Number(s.price_cents),
        currency: s.currency,
        referenceCode: invId,
        previousTransactionId: s.initial_transaction_id,
      });

      if (result.ok) {
        // Finalize atomically: mark the pending invoice paid + advance the
        // subscription and its membership in one transaction.
        await db.transaction(async (tx) => {
          await tx.execute(sql`
            UPDATE subscription_invoices
               SET status = 'paid', cybersource_payment_id = ${result.id ?? null}
             WHERE id = ${invId}
          `);
          await tx.execute(sql`
            UPDATE subscriptions
               SET status = 'active',
                   current_period_start = ${periodStart.toISOString()},
                   current_period_end = ${periodEnd.toISOString()},
                   next_billing_at = ${periodEnd.toISOString()},
                   failed_attempts = 0,
                   updated_at = now()
             WHERE id = ${s.id}
          `);
          if (s.membership_id) {
            await tx.execute(sql`
              UPDATE memberships
                 SET status = 'active', expires_at = ${periodEnd.toISOString()}
               WHERE id = ${s.membership_id}
            `);
          }
        });
        charged++;
      } else {
        // DEFINITIVE decline: flip the anchor to 'failed' (frees the period for
        // a dunning retry), bump the attempt counter, and back off.
        const attempts = Number(s.failed_attempts) + 1;
        const giveUp = attempts >= MAX_FAILED_ATTEMPTS;
        await db.transaction(async (tx) => {
          await tx.execute(sql`
            UPDATE subscription_invoices
               SET status = 'failed',
                   error_message = ${(result.errorText ?? result.status ?? "declined").slice(0, 400)}
             WHERE id = ${invId}
          `);
          await tx.execute(sql`
            UPDATE subscriptions
               SET status = ${giveUp ? "cancelled" : "past_due"},
                   failed_attempts = ${attempts},
                   next_billing_at = now() + (${RETRY_BACKOFF_SECONDS}::int * interval '1 second'),
                   updated_at = now()
             WHERE id = ${s.id}
          `);
          if (giveUp && s.membership_id) {
            await tx.execute(sql`
              UPDATE memberships SET status = 'expired'
               WHERE id = ${s.membership_id} AND status = 'active'
            `);
          }
        });
        failed++;
      }
    } catch (err: any) {
      // AMBIGUOUS failure (e.g. network error mid-charge): we do NOT know if the
      // card was charged. Leave the 'pending' invoice in place — its unique
      // anchor blocks any auto-retry of this period — and flag for manual
      // reconciliation rather than risk a double-charge.
      console.error(
        "[subscriptions.renew] ambiguous error for",
        s.id,
        "— left pending for manual reconciliation:",
        err?.message ?? err,
      );
      failed++;
    }
  }

  return { charged, failed };
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const { charged, failed } = await renewDueOnce();
    if (charged > 0 || failed > 0) {
      console.log(`[subscriptions] renewals: charged=${charged}, failed=${failed}`);
    }
  } catch (err: any) {
    console.error("[subscriptions] renewal loop error:", err?.message ?? err);
  } finally {
    running = false;
  }
}

export function startSubscriptionRenewalWorker() {
  if (workerStarted) return;
  if (!isCyberSourceConfigured()) {
    console.log("[subscriptions] CyberSource not configured — renewal worker idle");
    return;
  }
  workerStarted = true;
  console.log(`[subscriptions] renewal worker started — poll=${POLL_INTERVAL_MS}ms`);
  setTimeout(tick, 20_000); // let boot settle first
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopSubscriptionRenewalWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  workerStarted = false;
}
