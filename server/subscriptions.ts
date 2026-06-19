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
