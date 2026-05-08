// ============================================================================
// server/integrations/sharepointOutbox.ts
//
// Background drain worker for the sharepoint_outbox table.
//
// Loop:
//   every 30s (or on-demand via /api/admin/integrations/sharepoint/drain)
//     SELECT pending rows whose next_attempt_at <= now()  FOR UPDATE SKIP LOCKED
//     for each row:
//        join orders + branches + staff + customers + cars
//        build the 25 Excel columns (matching the user's master file)
//        call sharepoint.appendExcelRow()
//        on success: status='sent', sent_at=now()
//        on failure: attempts++, status='failed' if attempts>=8 else 'pending'
//                    next_attempt_at = now() + backoff(attempts)
//
// Designed so the POS hot path NEVER waits on SharePoint. The order
// transaction commits, the trigger enqueues, and this worker delivers
// async. SharePoint outage = queue grows; recovery drains the backlog.
// ============================================================================

import { sql } from 'drizzle-orm';
import { db } from '../db';
import {
  appendExcelRow,
  dateToExcelSerial,
  timeToExcelFraction,
  isSharePointConfigured,
  loadSharePointConfig,
} from './sharepoint';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 8;

// Backoff: 30s, 1m, 2m, 5m, 15m, 30m, 1h, 2h
const BACKOFF_SECONDS = [30, 60, 120, 300, 900, 1800, 3600, 7200];

let workerStarted = false;
let timer: NodeJS.Timeout | null = null;
let draining = false;

interface JoinedRow {
  outbox_id: string;
  op: 'sale' | 'refund';
  cx_number: string;
  // From orders
  order_id: string;
  status: string;
  payment_method: string;
  package_name: string;
  total_cents: number;
  subtotal_cents: number;
  service_charge_cents: number;
  tax_cents: number;
  discount_cents: number;
  promo_discount_cents: number;
  paid_amount_cents: number | null;
  change_cents: number;
  plate: string;
  customer_name_walkin: string | null;
  order_notes: string | null;
  item_notes: string | null;
  created_at: Date;
  refunded_at: Date | null;
  // From branches
  branch_name: string | null;
  // From staff
  staff_name: string | null;
  // From customers (POS customers table)
  customer_name: string | null;
  // From cars
  car_brand: string | null;
  car_model: string | null;
  // From orders OR resolved via original on refund
  original_cx_number: string | null;
}

// ---------------------------------------------------------------------------
// Map a joined DB row -> the 25 Excel columns (A..Y) in master file order.
//
// Excel headers:
//   A  Source.Name
//   B  ID
//   C  Receipt Date            (Excel serial number, integer)
//   D  Receipt Time            (fraction of a day, 0..1)
//   E  Store Name              (constant: "Cuci Xpress")
//   F  POS Name                (branch name — Tungku/Salar/etc.)
//   G  Employee Name           (uppercase, matching existing rows)
//   H  Is Refund               ("Yes" / "No")
//   I  Original Receipt No     (the original CX-N when refund, else "-")
//   J  Order Number            ("CX-1", "CX-2", ...)
//   K  Customer Name
//   L  Payment Type            ("Cash" / "Bank Transfer" / "QR Code" / ...)
//   M  Subtotal                (BND, not cents)
//   N  Discount Total
//   O  Promocode Discount Total
//   P  Service Charge Total
//   Q  Tax Total
//   R  Order Total
//   S  Paid Amount
//   T  Change
//   U  Order Notes
//   V  Item Notes
//   W  Extracted_Brand
//   X  Extracted_Model
//   Y  License_Plate
// ---------------------------------------------------------------------------
const DASH = '-';
const cents2 = (c: number | null | undefined): number => Math.round((c ?? 0)) / 100;
const dashOr = (v: string | null | undefined): string => (v && v.trim() !== '') ? v : DASH;

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  qr_code: 'QR Code',
  baiduri_pay: 'Baiduri Pay',
  quick_pay: 'Quick Pay',
  subscription: 'Subscription',
  voucher: 'Voucher',
};

function buildExcelRow(r: JoinedRow): (string | number | null)[] {
  const isRefund = r.op === 'refund';
  // Receipt Date/Time: refunds use refunded_at (when the refund happened),
  // sales use created_at. Mirrors the KedaiPOS export convention of one
  // row per event timestamp.
  const eventAt = isRefund && r.refunded_at ? r.refunded_at : r.created_at;
  return [
    'cucixpress_pos',                                                  // A Source.Name
    r.order_id,                                                        // B ID (our internal order id)
    dateToExcelSerial(eventAt),                                        // C Receipt Date
    timeToExcelFraction(eventAt),                                      // D Receipt Time
    'Cuci Xpress',                                                     // E Store Name
    dashOr(r.branch_name),                                             // F POS Name (branch)
    dashOr(r.staff_name ? r.staff_name.toUpperCase() : null),          // G Employee Name
    isRefund ? 'Yes' : 'No',                                           // H Is Refund
    isRefund ? dashOr(r.original_cx_number) : DASH,                    // I Original Receipt No
    r.cx_number,                                                       // J Order Number
    dashOr(r.customer_name ?? r.customer_name_walkin),                 // K Customer Name
    PAYMENT_METHOD_LABEL[r.payment_method] ?? r.payment_method,        // L Payment Type
    cents2(r.subtotal_cents),                                          // M Subtotal
    cents2(r.discount_cents),                                          // N Discount Total
    cents2(r.promo_discount_cents),                                    // O Promocode Discount Total
    cents2(r.service_charge_cents),                                    // P Service Charge Total
    cents2(r.tax_cents),                                               // Q Tax Total
    cents2(r.total_cents),                                             // R Order Total
    cents2(r.paid_amount_cents ?? r.total_cents),                      // S Paid Amount
    cents2(r.change_cents),                                            // T Change
    dashOr(r.order_notes),                                             // U Order Notes
    dashOr(r.item_notes ?? r.package_name),                            // V Item Notes (fall back to package name)
    dashOr(r.car_brand),                                               // W Extracted_Brand
    dashOr(r.car_model),                                               // X Extracted_Model
    dashOr(r.plate),                                                   // Y License_Plate
  ];
}

// ---------------------------------------------------------------------------
// Drain a single batch. Public so the admin "drain now" button can call it.
// ---------------------------------------------------------------------------
export async function drainOnce(): Promise<{ picked: number; sent: number; failed: number }> {
  if (!isSharePointConfigured()) return { picked: 0, sent: 0, failed: 0 };

  // Pull a batch of pending rows. SKIP LOCKED so two workers (or a manual
  // drain firing while the timer also fires) never fight over the same row.
  // We intentionally do NOT mutate inside the SELECT txn — each row gets
  // its own short transaction below so a single Graph failure doesn't
  // roll back successful rows.
  const pickRes = await db.execute(sql`
    SELECT id FROM sharepoint_outbox
     WHERE status = 'pending'
       AND next_attempt_at <= now()
     ORDER BY id ASC
     LIMIT ${BATCH_SIZE}
     FOR UPDATE SKIP LOCKED
  `);
  const ids = (pickRes.rows as Array<{ id: string }>).map(r => r.id);
  if (ids.length === 0) return { picked: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const id of ids) {
    // Hydrate the joined row.
    const rowRes = await db.execute(sql`
      SELECT
        sob.id::text                    AS outbox_id,
        sob.op                          AS op,
        sob.cx_number                   AS cx_number,
        o.id                            AS order_id,
        o.status                        AS status,
        o.payment_method                AS payment_method,
        o.package_name                  AS package_name,
        o.total_cents                   AS total_cents,
        o.subtotal_cents                AS subtotal_cents,
        o.service_charge_cents          AS service_charge_cents,
        o.tax_cents                     AS tax_cents,
        o.discount_cents                AS discount_cents,
        o.promo_discount_cents          AS promo_discount_cents,
        o.paid_amount_cents             AS paid_amount_cents,
        o.change_cents                  AS change_cents,
        o.plate                         AS plate,
        o.customer_name_walkin          AS customer_name_walkin,
        o.order_notes                   AS order_notes,
        o.item_notes                    AS item_notes,
        o.created_at                    AS created_at,
        o.refunded_at                   AS refunded_at,
        b.name                          AS branch_name,
        st.name                         AS staff_name,
        c.name                          AS customer_name,
        car.brand                       AS car_brand,
        car.model                       AS car_model,
        (SELECT cx_number FROM sharepoint_outbox
          WHERE order_id = o.id AND op = 'sale'
          ORDER BY id ASC LIMIT 1)      AS original_cx_number
      FROM sharepoint_outbox sob
      JOIN orders     o   ON o.id = sob.order_id
      LEFT JOIN branches b   ON b.id  = o.branch_id
      LEFT JOIN staff    st  ON st.id = o.staff_id
      LEFT JOIN customers c  ON c.id  = o.customer_id
      LEFT JOIN cars     car ON car.id = o.vehicle_id
      WHERE sob.id = ${id}
    `);
    const r = rowRes.rows[0] as unknown as JoinedRow | undefined;
    if (!r) {
      // Outbox row missing — shouldn't happen, mark failed to avoid re-pick.
      await db.execute(sql`
        UPDATE sharepoint_outbox
           SET status = 'failed',
               last_error = 'outbox_row_vanished',
               attempts = attempts + 1
         WHERE id = ${id}
      `);
      failed++;
      continue;
    }

    try {
      const values = buildExcelRow(r);
      // SHAREPOINT_DRY_RUN=1 — skip the real Graph call, log what would
      // have been sent. Useful to validate column mapping end-to-end
      // against a real DB before pointing at a real Excel file.
      if (process.env.SHAREPOINT_DRY_RUN === '1') {
        console.log(`[sharepoint-outbox] DRY RUN row ${id} (${r.cx_number} ${r.op}) values:`, values);
        await db.execute(sql`
          UPDATE sharepoint_outbox
             SET status = 'sent',
                 sent_at = now(),
                 attempts = attempts + 1,
                 excel_row_id = 'dry-run',
                 last_error = NULL
           WHERE id = ${id}
        `);
        sent++;
        continue;
      }
      const result = await appendExcelRow(values);
      await db.execute(sql`
        UPDATE sharepoint_outbox
           SET status = 'sent',
               sent_at = now(),
               attempts = attempts + 1,
               excel_row_id = ${result.excelRowId},
               last_error = NULL
         WHERE id = ${id}
      `);
      sent++;
    } catch (err: any) {
      const msg = String(err?.message ?? err).slice(0, 1000);
      // Compute next attempt or terminal failure.
      const attemptsRes = await db.execute(sql`
        SELECT attempts FROM sharepoint_outbox WHERE id = ${id}
      `);
      const currentAttempts = (attemptsRes.rows[0] as { attempts: number } | undefined)?.attempts ?? 0;
      const nextAttempts = currentAttempts + 1;
      const terminal = nextAttempts >= MAX_ATTEMPTS;
      const backoff = BACKOFF_SECONDS[Math.min(nextAttempts - 1, BACKOFF_SECONDS.length - 1)];

      await db.execute(sql`
        UPDATE sharepoint_outbox
           SET status          = ${terminal ? 'failed' : 'pending'},
               attempts        = ${nextAttempts},
               last_error      = ${msg},
               next_attempt_at = now() + (${backoff}::int * interval '1 second')
         WHERE id = ${id}
      `);
      failed++;
      if (terminal) {
        console.error(`[sharepoint-outbox] row ${id} (order ${r.order_id}) gave up after ${nextAttempts} attempts: ${msg}`);
      } else {
        console.warn(`[sharepoint-outbox] row ${id} attempt ${nextAttempts} failed, retrying in ${backoff}s: ${msg.slice(0, 200)}`);
      }
    }
  }

  return { picked: ids.length, sent, failed };
}

// ---------------------------------------------------------------------------
// Long-running worker (one per process)
// ---------------------------------------------------------------------------
async function tick() {
  if (draining) return;
  draining = true;
  try {
    const { picked, sent, failed } = await drainOnce();
    if (picked > 0) {
      console.log(`[sharepoint-outbox] drained ${picked}: sent=${sent}, failed=${failed}`);
    }
  } catch (err) {
    console.error('[sharepoint-outbox] drain loop error:', err);
  } finally {
    draining = false;
  }
}

export function startSharePointOutboxWorker() {
  if (workerStarted) return;
  if (!isSharePointConfigured()) {
    console.log('[sharepoint-outbox] SharePoint not configured — worker idle');
    return;
  }
  const cfg = loadSharePointConfig()!;
  console.log(`[sharepoint-outbox] worker started — site=${cfg.siteHost}${cfg.sitePath}, table=${cfg.tableName}, poll=${POLL_INTERVAL_MS}ms`);
  workerStarted = true;
  // First tick after a short delay so app boot isn't blocked.
  setTimeout(tick, 5_000);
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

export function stopSharePointOutboxWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  workerStarted = false;
}

// ---------------------------------------------------------------------------
// Admin: snapshot of queue + recent activity
// ---------------------------------------------------------------------------
export interface OutboxSnapshot {
  configured: boolean;
  worker_running: boolean;
  totals: { pending: number; sent: number; failed: number };
  recent: Array<{
    id: number;
    order_id: string;
    cx_number: string;
    op: string;
    status: string;
    attempts: number;
    last_error: string | null;
    enqueued_at: string;
    sent_at: string | null;
  }>;
}

export async function getOutboxSnapshot(): Promise<OutboxSnapshot> {
  const totalsRes = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'sent')::int    AS sent,
      COUNT(*) FILTER (WHERE status = 'failed')::int  AS failed
    FROM sharepoint_outbox
  `);
  const totals = (totalsRes.rows[0] as any) ?? { pending: 0, sent: 0, failed: 0 };
  const recentRes = await db.execute(sql`
    SELECT id, order_id, cx_number, op, status, attempts, last_error,
           enqueued_at, sent_at
      FROM sharepoint_outbox
     ORDER BY id DESC
     LIMIT 20
  `);
  return {
    configured: isSharePointConfigured(),
    worker_running: workerStarted,
    totals,
    recent: recentRes.rows as any,
  };
}

// Manual retry: flip a 'failed' (or otherwise stuck) row back to 'pending'.
export async function retryOutboxRow(id: number): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE sharepoint_outbox
       SET status = 'pending',
           next_attempt_at = now(),
           last_error = NULL
     WHERE id = ${id}
       AND status IN ('pending','failed')
   RETURNING id
  `);
  return res.rows.length > 0;
}
