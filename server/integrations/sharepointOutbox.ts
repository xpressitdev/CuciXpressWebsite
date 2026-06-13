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
  getExcelRowValues,
  updateExcelRow,
  dateToExcelSerial,
  timeToExcelFraction,
  isSharePointConfigured,
  loadSharePointConfig,
} from './sharepoint';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 8;
// How long a claimed ("leased") row is hidden from other drainers while it
// is being sent. If the process dies mid-send, the lease expires and the row
// becomes eligible again so it is never lost. Must comfortably exceed the
// time to send one BATCH_SIZE worth of Graph appends.
const LEASE_SECONDS = 300;

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
//   E  Store Name              (branch — "Tungku Branch", "Salar Branch", ...)
//   F  POS Name                (POS terminal — "Default" until we track terminals)
//   G  Employee Name           (matches historical "Kadai <BranchShort>" convention)
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
//   U  Order Notes             (what was sold — order_notes text, else package name)
//   V  Item Notes              (vehicle summary — "BRAND MODEL PLATE")
//   W  Extracted_Brand
//   X  Extracted_Model
//   Y  License_Plate
// ---------------------------------------------------------------------------
const DASH = '-';
const cents2 = (c: number | null | undefined): number => Math.round((c ?? 0)) / 100;
const dashOr = (v: string | null | undefined): string => (v && v.trim() !== '') ? v : DASH;

// Build the "Item Notes" string in the historical convention:
// "BRAND MODEL PLATE" (uppercase). Any missing piece is dropped, e.g.
// only-plate is fine; all-missing returns DASH.
function buildItemNotes(
  brand: string | null | undefined,
  model: string | null | undefined,
  plate: string | null | undefined,
): string {
  const parts = [brand, model, plate]
    .map(p => (p ?? '').trim())
    .filter(p => p.length > 0)
    .map(p => p.toUpperCase());
  return parts.length === 0 ? DASH : parts.join(' ');
}

// Strip the "Cuci Xpress " prefix from branch names so the output
// matches the historical Power BI convention:
//   "Cuci Xpress Tungku" -> "Tungku"
function shortBranch(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.replace(/^Cuci Xpress\s+/i, '').trim();
}

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
  // Raw db.execute() returns timestamps as ISO strings, not Date objects.
  // Coerce defensively so dateToExcelSerial / timeToExcelFraction always
  // see a real Date.
  const rawEventAt = isRefund && r.refunded_at ? r.refunded_at : r.created_at;
  const eventAt = rawEventAt instanceof Date ? rawEventAt : new Date(rawEventAt as any);
  const branchShort = shortBranch(r.branch_name);
  // Refund lines mirror the original sale. Only the "Order Total" (R) column flips
  // NEGATIVE on a refund, so a plain SUM of Order Total in Power BI nets refunds out
  // automatically. The breakdown columns (Subtotal, Discount, Promo, Service Charge,
  // Tax) and the settlement columns (Paid Amount, Change) keep their natural POSITIVE
  // sign — the row describes the original sale being reversed, with Order Total as the
  // single directional figure (matches the previous POS export the owner relies on).
  // The "Is Refund" (H) and "Original Receipt No" (I) columns still flag the line.
  // Zero stays zero so we never emit a confusing -0.
  const money = (c: number | null | undefined): number => cents2(c);
  const orderTotalMoney = (c: number | null | undefined): number => {
    const v = cents2(c);
    return isRefund && v !== 0 ? -v : v;
  };
  return [
    'cucixpress_pos',                                                  // A Source.Name
    r.order_id,                                                        // B ID (our internal order id)
    dateToExcelSerial(eventAt),                                        // C Receipt Date
    timeToExcelFraction(eventAt),                                      // D Receipt Time
    branchShort ? `${branchShort} Branch` : DASH,                      // E Store Name ("Tungku Branch")
    'Default',                                                         // F POS Name (we don't track POS terminals yet)
    branchShort ? `Kadai ${branchShort}` : DASH,                       // G Employee Name (matches historical "Kadai Xxx")
    isRefund ? 'Yes' : 'No',                                           // H Is Refund
    isRefund ? dashOr(r.original_cx_number) : DASH,                    // I Original Receipt No
    r.cx_number,                                                       // J Order Number
    dashOr(r.customer_name ?? r.customer_name_walkin),                 // K Customer Name
    PAYMENT_METHOD_LABEL[r.payment_method] ?? r.payment_method,        // L Payment Type
    money(r.subtotal_cents),                                           // M Subtotal       (stays positive on refund)
    money(r.discount_cents),                                           // N Discount Total (stays positive on refund)
    money(r.promo_discount_cents),                                     // O Promocode Discount Total (stays positive on refund)
    money(r.service_charge_cents),                                     // P Service Charge Total (stays positive on refund)
    money(r.tax_cents),                                                // Q Tax Total      (stays positive on refund)
    orderTotalMoney(r.total_cents),                                    // R Order Total    (NEGATIVE on refund)
    money(r.paid_amount_cents ?? r.total_cents),                       // S Paid Amount    (stays positive on refund)
    money(r.change_cents),                                             // T Change         (stays positive on refund)
    dashOr(r.order_notes ?? r.package_name),                           // U Order Notes (cashier note, else package name)
    buildItemNotes(r.car_brand, r.car_model, r.plate),                 // V Item Notes ("BRAND MODEL PLATE")
    dashOr(r.car_brand),                                               // W Extracted_Brand
    dashOr(r.car_model),                                               // X Extracted_Model
    dashOr(r.plate),                                                   // Y License_Plate
  ];
}

// ---------------------------------------------------------------------------
// Hydrate one outbox row into the joined shape buildExcelRow() expects.
// Shared by the drain worker and the refund-sign backfill.
// ---------------------------------------------------------------------------
async function hydrateJoinedRow(id: string | number): Promise<JoinedRow | undefined> {
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
  return rowRes.rows[0] as unknown as JoinedRow | undefined;
}

// ---------------------------------------------------------------------------
// Drain a single batch. Public so the admin "drain now" button can call it.
// ---------------------------------------------------------------------------
export async function drainOnce(): Promise<{ picked: number; sent: number; failed: number }> {
  if (!isSharePointConfigured()) return { picked: 0, sent: 0, failed: 0 };

  // Atomically CLAIM a batch of pending rows in a single statement.
  //
  // Why a single UPDATE...RETURNING (not SELECT...FOR UPDATE then process):
  // under Neon's HTTP driver every db.execute() auto-commits on its own, so a
  // bare `SELECT ... FOR UPDATE SKIP LOCKED` releases its row locks the instant
  // the SELECT returns — long before we append to Excel. Two drainers running
  // at once (the 30s timer overlapping a manual "drain now", or two deployment
  // instances) would then both pick the same rows and append each order twice.
  //
  // Folding the lock + the claim into one statement closes that race: the
  // SKIP LOCKED inside the sub-select hides rows another drainer is claiming in
  // its own concurrent statement, and pushing next_attempt_at into the future
  // (a "lease") hides the claimed rows from any later pass until the lease
  // expires. On success the row flips to 'sent'; on failure the catch block
  // overwrites next_attempt_at with the proper backoff. If the process dies
  // mid-send, the lease lapses after LEASE_SECONDS and the row retries.
  const claimRes = await db.execute(sql`
    UPDATE sharepoint_outbox
       SET next_attempt_at = now() + (${LEASE_SECONDS}::int * interval '1 second')
     WHERE id IN (
       SELECT id FROM sharepoint_outbox
        WHERE status = 'pending'
          AND next_attempt_at <= now()
        ORDER BY id ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, next_attempt_at AS lease
  `);
  // `lease` is the next_attempt_at value this drainer stamped onto the row.
  // We carry it into every write-back below as an ownership token: a stale
  // drainer whose lease has since been overwritten (because the lease lapsed
  // and another worker re-claimed the row) will match zero rows and quietly
  // no-op instead of clobbering the newer worker's state.
  const claimed = (claimRes.rows as Array<{ id: string; lease: string }>).map(
    r => ({ id: r.id, lease: r.lease }),
  );
  if (claimed.length === 0) return { picked: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const { id, lease } of claimed) {
    // Hydrate the joined row.
    const r = await hydrateJoinedRow(id);
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
             AND next_attempt_at = ${lease}
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
           AND next_attempt_at = ${lease}
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
           AND next_attempt_at = ${lease}
      `);
      failed++;
      if (terminal) {
        console.error(`[sharepoint-outbox] row ${id} (order ${r.order_id}) gave up after ${nextAttempts} attempts: ${msg}`);
      } else {
        console.warn(`[sharepoint-outbox] row ${id} attempt ${nextAttempts} failed, retrying in ${backoff}s: ${msg.slice(0, 200)}`);
      }
    }
  }

  return { picked: claimed.length, sent, failed };
}

// ---------------------------------------------------------------------------
// One-off backfill: rewrite already-sent refund rows in Excel so they match the
// current buildExcelRow() convention — POSITIVE breakdown/settlement columns and
// a NEGATIVE "Order Total" (R). An earlier fix had made every money column (M..T)
// negative; the owner only wants Order Total negative, so this re-corrects the
// rows written under the old all-negative convention.
//
// This re-builds each sent refund row from the current DB state and PATCHes the
// existing Excel row in place.
//
// Safety: before overwriting, we GET the live Excel row and verify its
// identity (col B = our order_id, col H = "Yes", col J = the same CX-N). If
// the row doesn't match (e.g. the sheet was manually re-sorted so the stored
// index drifted) we SKIP it rather than risk corrupting an unrelated row.
// Rows already in the current convention (Subtotal > 0 AND Order Total < 0) are
// skipped as no-ops.
// ---------------------------------------------------------------------------
export interface RefundBackfillResult {
  total: number;
  updated: number;
  alreadyCorrect: number;
  skippedMismatch: number;
  errors: Array<{ cx_number: string; excel_row_id: string; error: string }>;
}

export async function backfillSentRefundRows(dryRun = false): Promise<RefundBackfillResult> {
  const result: RefundBackfillResult = {
    total: 0, updated: 0, alreadyCorrect: 0, skippedMismatch: 0, errors: [],
  };
  if (!isSharePointConfigured()) {
    throw new Error('sharepoint_not_configured');
  }

  const res = await db.execute(sql`
    SELECT id, cx_number, order_id, excel_row_id
      FROM sharepoint_outbox
     WHERE op = 'refund'
       AND status = 'sent'
       AND excel_row_id IS NOT NULL
       AND excel_row_id NOT IN ('', 'dry-run')
     ORDER BY id ASC
  `);
  const rows = res.rows as Array<{ id: number; cx_number: string; order_id: string; excel_row_id: string }>;
  result.total = rows.length;

  for (const row of rows) {
    const idx = Number(row.excel_row_id);
    try {
      if (!Number.isInteger(idx) || idx < 0) {
        result.errors.push({ cx_number: row.cx_number, excel_row_id: row.excel_row_id, error: 'invalid_excel_row_id' });
        continue;
      }
      const r = await hydrateJoinedRow(row.id);
      if (!r) {
        result.errors.push({ cx_number: row.cx_number, excel_row_id: row.excel_row_id, error: 'outbox_row_vanished' });
        continue;
      }

      // Verify the live Excel row is the one we think it is before overwriting.
      const live = await getExcelRowValues(idx);
      const liveId = String(live[1] ?? '');     // B ID
      const liveRefund = String(live[7] ?? '');  // H Is Refund
      const liveCx = String(live[9] ?? '');      // J Order Number
      const liveSubtotal = Number(live[12] ?? 0);   // M Subtotal
      const liveOrderTotal = Number(live[17] ?? 0); // R Order Total
      if (liveId !== r.order_id || liveRefund.toLowerCase() !== 'yes' || liveCx !== row.cx_number) {
        result.skippedMismatch++;
        console.warn(`[refund-backfill] SKIP ${row.cx_number} @${idx}: identity mismatch (id="${liveId}" refund="${liveRefund}" cx="${liveCx}")`);
        continue;
      }
      // Already in the current convention: Subtotal non-negative, Order Total
      // non-positive. Covers normal refunds (Subtotal > 0, Order Total < 0) and
      // zero-amount refunds (both 0) so re-runs are idempotent.
      if (liveSubtotal >= 0 && liveOrderTotal <= 0) {
        result.alreadyCorrect++;
        continue;
      }

      const values = buildExcelRow(r); // op='refund' => positive breakdown, negative Order Total
      if (dryRun) {
        console.log(`[refund-backfill] DRY RUN would update ${row.cx_number} @${idx}: M ${liveSubtotal} -> ${values[12]}, R -> ${values[17]}`);
        result.updated++;
        continue;
      }
      await updateExcelRow(idx, values);
      console.log(`[refund-backfill] updated ${row.cx_number} @${idx}: M ${liveSubtotal} -> ${values[12]}`);
      result.updated++;
    } catch (err: any) {
      const msg = String(err?.message ?? err).slice(0, 300);
      result.errors.push({ cx_number: row.cx_number, excel_row_id: row.excel_row_id, error: msg });
      console.error(`[refund-backfill] ERROR ${row.cx_number} @${idx}: ${msg}`);
    }
  }

  return result;
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
  const target = cfg.driveType === 'user'
    ? `OneDrive(${cfg.userEmail})`
    : `Site(${cfg.siteHost}${cfg.sitePath})`;
  console.log(`[sharepoint-outbox] worker started — target=${target}, file=${cfg.filePath}, table=${cfg.tableName}, poll=${POLL_INTERVAL_MS}ms`);
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
  // Only retry rows that are not currently leased to a live drainer: a
  // terminally 'failed' row, or a 'pending' row whose lease has already
  // lapsed (next_attempt_at <= now()). Forcing a row that another worker is
  // mid-send on would reintroduce the concurrent-reprocessing race.
  const res = await db.execute(sql`
    UPDATE sharepoint_outbox
       SET status = 'pending',
           next_attempt_at = now(),
           last_error = NULL
     WHERE id = ${id}
       AND (status = 'failed' OR (status = 'pending' AND next_attempt_at <= now()))
   RETURNING id
  `);
  return res.rows.length > 0;
}
