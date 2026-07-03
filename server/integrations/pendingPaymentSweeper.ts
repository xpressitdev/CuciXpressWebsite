// ============================================================================
// server/integrations/pendingPaymentSweeper.ts
//
// Background sweep that auto-voids abandoned web checkouts.
//
// A web Pocket Pay order sits in status='pending_payment' until its payment
// callback arrives and finalizes it. If the customer never completes payment
// (closed the app, lost signal, changed their mind), the order lingers there
// forever and pollutes the "pending web payments" reconciliation list.
//
// This worker periodically voids any order still in 'pending_payment' once it
// is older than AUTO_VOID_AFTER_HOURS. It mirrors the exact SQL of the manual
// void endpoint (POST /api/admin/orders/:id/void-pending) and is safe for the
// same reason: /api/payment-callback only finalizes orders whose status is
// still 'pending_payment', so a (vanishingly rare) late confirmation after the
// void window is simply ignored rather than double-charging or reviving a
// stale order. Voiding does not fire the SharePoint outbox trigger (it only
// fires on paid/queued/refunded), so no export row is produced.
// ============================================================================

import { sql } from 'drizzle-orm';
import { db } from '../db';

const AUTO_VOID_AFTER_HOURS = 72;
const POLL_INTERVAL_MS = 30 * 60_000; // every 30 minutes

let timer: ReturnType<typeof setInterval> | null = null;
let workerStarted = false;

async function tick() {
  try {
    const rows = (await db.execute(sql`
      UPDATE orders
         SET status = 'voided'
       WHERE status = 'pending_payment'
         AND qr_provider = 'pocket_pay'
         AND created_at < NOW() - (${AUTO_VOID_AFTER_HOURS} * INTERVAL '1 hour')
      RETURNING id
    `)).rows;
    if (rows.length > 0) {
      console.log(`[pending-void] auto-voided ${rows.length} pending_payment order(s) older than ${AUTO_VOID_AFTER_HOURS}h`);
    }
  } catch (err) {
    console.error('[pending-void] sweep failed:', err);
  }
}

export function startPendingPaymentSweeper() {
  if (workerStarted) return;
  workerStarted = true;
  console.log(`[pending-void] worker started — auto-void after ${AUTO_VOID_AFTER_HOURS}h, poll=${POLL_INTERVAL_MS}ms`);
  // First sweep after a short delay so app boot isn't blocked.
  setTimeout(tick, 10_000);
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopPendingPaymentSweeper() {
  if (timer) clearInterval(timer);
  timer = null;
  workerStarted = false;
}
