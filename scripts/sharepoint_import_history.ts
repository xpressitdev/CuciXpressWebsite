// ============================================================================
// scripts/sharepoint_import_history.ts
//
// One-shot importer that streams every data row out of the SharePoint
// master Excel file and writes it into Postgres as legacy `orders` rows
// (with `legacy_source='sharepoint'` + `legacy_source_row_number`), while
// upserting `cars` keyed on the normalised plate.
//
// Idempotent — re-running skips rows that were already imported, so it's
// safe to interrupt and restart, and safe to run again after the dummy
// file is swapped for the real one.
//
// Usage:
//   tsx scripts/sharepoint_import_history.ts             # import all rows
//   tsx scripts/sharepoint_import_history.ts --limit 500 # import first 500 only
//   tsx scripts/sharepoint_import_history.ts --dry-run   # parse only, no writes
//
// What we read (column letters mirror sharepointOutbox.ts buildExcelRow):
//   C  Receipt Date          (Excel serial)
//   D  Receipt Time          (Excel fraction of a day)
//   E  Store Name            "Tungku Branch", "Salar Branch", ...
//   H  Is Refund              "Yes" / "No"
//   K  Customer Name
//   L  Payment Type          "Cash", "Bank Transfer", ...
//   R  Order Total           "B$9.00" or "9.00"
//   U  Order Notes           used as package_name when present
//   W  Extracted_Brand
//   X  Extracted_Model
//   Y  License_Plate
// ============================================================================

import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { loadSharePointConfig, type SharePointConfig } from '../server/integrations/sharepoint';

// --- CLI args ---------------------------------------------------------------
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const DRY_RUN = args.includes('--dry-run');

// --- Branch name -> id (matches BRANCHES in client/src/pages/pos.tsx) -------
const BRANCH_NAME_TO_ID: Record<string, number> = {
  TUNGKU: 1,
  SALAR: 2,
  BENGKURONG: 3,
  TUTONG: 4,
  LAMBAK: 5,
};

function parseBranchId(storeName: string | null | undefined): number | null {
  if (!storeName) return null;
  // Excel value is e.g. "Tungku Branch" — strip suffix, uppercase, lookup.
  const key = String(storeName)
    .toUpperCase()
    .replace(/\s+BRANCH\s*$/i, '')
    .replace(/^CUCI\s+XPRESS\s+/i, '')
    .trim();
  return BRANCH_NAME_TO_ID[key] ?? null;
}

// --- Payment type Excel label -> orders.payment_method enum -----------------
const PAYMENT_LABEL_TO_METHOD: Record<string, string> = {
  CASH: 'cash',
  'BANK TRANSFER': 'bank_transfer',
  CARD: 'card',
  'QR CODE': 'qr_code',
  QR: 'qr_code',
  'BAIDURI PAY': 'baiduri_pay',
  'QUICK PAY': 'quick_pay',
  SUBSCRIPTION: 'subscription',
  VOUCHER: 'voucher',
};

function parsePaymentMethod(label: string | null | undefined): string {
  if (!label) return 'cash';
  const key = String(label).toUpperCase().trim();
  return PAYMENT_LABEL_TO_METHOD[key] ?? 'cash';
}

// --- Excel serial -> ISO datetime (Brunei UTC+8) ----------------------------
const BRUNEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function excelToDate(daySerial: number, dayFraction: number | null): Date | null {
  if (!Number.isFinite(daySerial) || daySerial <= 0) return null;
  // Inverse of dateToExcelSerial / timeToExcelFraction:
  //   utc_ms = (serial - 25569) * 86_400_000 + fraction * 86_400_000 - BRUNEI_OFFSET_MS
  const frac = Number.isFinite(dayFraction) ? Number(dayFraction) : 0;
  const utcMs = (daySerial - 25569) * 86_400_000 + (frac ?? 0) * 86_400_000 - BRUNEI_OFFSET_MS;
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// --- Money string -> integer cents -----------------------------------------
function parseMoneyCents(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100);
  const s = String(v).replace(/[^0-9.\-]/g, '');
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function normalizePlate(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function nullIfDash(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t || t === '-' || t === '—') return null;
  return t;
}

// --- Graph helpers ----------------------------------------------------------
async function getToken(cfg: SharePointConfig): Promise<string> {
  const r = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!r.ok) throw new Error(`token failed: ${r.status} ${await r.text()}`);
  return (await r.json() as any).access_token;
}

function driveBase(cfg: SharePointConfig): string {
  const encodedFilePath = cfg.filePath.split('/').map(encodeURIComponent).join('/');
  if (cfg.driveType === 'user') {
    return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.userEmail)}/drive/root:${encodedFilePath}`;
  }
  throw new Error('site mode not implemented in this importer; add it if needed');
}

// Convert column letter ('A','Z','AA') to 0-based index.
function colLetterToIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// --- Main ------------------------------------------------------------------
async function main() {
  const cfg = loadSharePointConfig();
  if (!cfg) { console.error('SharePoint not configured'); process.exit(1); }

  // Token is mutable: Graph access tokens expire after ~1 hour. We
  // refresh proactively (every 45 min) and reactively (on 401).
  let tok = await getToken(cfg);
  let tokenFetchedAt = Date.now();
  const TOKEN_TTL_MS = 45 * 60 * 1000;
  async function ensureFreshToken(force = false) {
    if (force || Date.now() - tokenFetchedAt > TOKEN_TTL_MS) {
      tok = await getToken(cfg);
      tokenFetchedAt = Date.now();
      console.log('[token] refreshed');
    }
  }
  const base = driveBase(cfg);
  const tableUrl = `${base}:/workbook/tables/${encodeURIComponent(cfg.tableName)}`;

  // Retry-with-backoff helper. Graph throws 503/429 occasionally; we
  // back off exponentially up to 60s and try at most 6 times before
  // giving up on a single chunk. On 401, refresh the token and retry.
  async function fetchWithRetry(url: string, label: string, maxAttempts = 6): Promise<Response> {
    let delay = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await ensureFreshToken();
        const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) return r;
        if (r.status === 401) {
          console.warn(`[retry ${attempt}/${maxAttempts}] ${label} got 401, refreshing token…`);
          await ensureFreshToken(true);
          continue;
        }
        if (r.status === 429 || r.status >= 500) {
          const retryAfter = Number(r.headers.get('retry-after')) || 0;
          const wait = retryAfter > 0 ? retryAfter * 1000 : delay;
          console.warn(`[retry ${attempt}/${maxAttempts}] ${label} got ${r.status}, waiting ${wait}ms…`);
          await new Promise(res => setTimeout(res, wait));
          delay = Math.min(delay * 2, 60_000);
          continue;
        }
        // 4xx other than 401/429 — bail.
        throw new Error(`${label} failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
      } catch (err: any) {
        if (attempt === maxAttempts) throw err;
        console.warn(`[retry ${attempt}/${maxAttempts}] ${label} threw: ${err.message ?? err}, waiting ${delay}ms…`);
        await new Promise(res => setTimeout(res, delay));
        delay = Math.min(delay * 2, 60_000);
      }
    }
    throw new Error(`${label} exhausted retries`);
  }

  // Total data rows (header excluded).
  const rangeRes = await fetchWithRetry(`${tableUrl}/range?$select=address,rowCount,columnCount`, 'table range');
  const range = await rangeRes.json() as { address: string; rowCount: number; columnCount: number };
  const totalDataRows = range.rowCount - 1;
  const totalCols = range.columnCount;
  console.log(`Excel table: ${range.address}, ${totalDataRows} data rows, ${totalCols} columns.`);

  const toImport = Math.min(totalDataRows, LIMIT);
  console.log(`Will scan ${toImport} rows (LIMIT=${LIMIT === Infinity ? 'all' : LIMIT}, DRY_RUN=${DRY_RUN}).`);

  // Find which row numbers are already imported, so we skip them.
  const existingRes = DRY_RUN ? { rows: [] as any[] } : await db.execute(sql`
    SELECT legacy_source_row_number AS n
      FROM orders
     WHERE legacy_source = 'sharepoint'
  `);
  const alreadyImported = new Set<number>(existingRes.rows.map((r: any) => Number(r.n)));
  console.log(`Already imported: ${alreadyImported.size} rows.`);

  // Column indices we care about (0-based).
  const C_DATE   = colLetterToIndex('C');
  const C_TIME   = colLetterToIndex('D');
  const C_STORE  = colLetterToIndex('E');
  const C_REFUND = colLetterToIndex('H');
  const C_CUST   = colLetterToIndex('K');
  const C_PAY    = colLetterToIndex('L');
  const C_TOTAL  = colLetterToIndex('R');
  const C_NOTES  = colLetterToIndex('U');
  const C_BRAND  = colLetterToIndex('W');
  const C_MODEL  = colLetterToIndex('X');
  const C_PLATE  = colLetterToIndex('Y');

  // Stream rows from the table's dataBodyRange in chunks. Excel addresses
  // for the table are zero-based when using `itemAt(index=N)` row endpoints,
  // but the column-letter range under `worksheets/{sheet}/range(address=...)`
  // is 1-based and includes the header at row 1. We use the table's own
  // /range endpoint instead, which only covers data rows.
  //
  // The simplest reliable way to slice large tables is the
  // `tables/{name}/dataBodyRange` row offsets, fetched via column-letter
  // sub-range. We do it via the worksheet `usedRange` slice using the
  // table's address as the anchor.

  // Parse the table address ("Sheet1!A1:Y129000") to get sheet name +
  // top-left row + col letters.
  const m = range.address.match(/^([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`unexpected table address: ${range.address}`);
  const sheetName = m[1].replace(/^'|'$/g, '');
  const startCol = m[2];
  const headerRow = Number(m[3]);
  const endCol = m[4];
  const firstDataRow = headerRow + 1;
  const lastDataRow = Number(m[5]);
  console.log(`Sheet=${sheetName} cols=${startCol}:${endCol} dataRows=${firstDataRow}..${lastDataRow}`);

  const CHUNK = 1000; // rows per Graph call
  let processed = 0;
  let inserted = 0;
  let skippedNoPlate = 0;
  let skippedRefund = 0;
  let skippedExisting = 0;
  let skippedBadDate = 0;
  let skippedBadBranch = 0;
  let dbErrors = 0;

  // Cache: normalisedPlate -> car_id, so a car that appears 50x doesn't
  // hit Postgres 50x for the upsert.
  const carCache = new Map<string, number>();

  for (let offset = 0; offset < toImport; offset += CHUNK) {
    const lo = firstDataRow + offset;
    const hi = Math.min(firstDataRow + offset + CHUNK - 1, firstDataRow + toImport - 1);
    const addr = `${startCol}${lo}:${endCol}${hi}`;
    const url = `${base}:/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${encodeURIComponent(addr)}')?$select=values`;

    let res: Response;
    try {
      res = await fetchWithRetry(url, `chunk ${addr}`);
    } catch (err: any) {
      console.error(`SKIPPING chunk ${addr} after retries exhausted:`, err.message ?? err);
      continue;
    }
    const json = await res.json() as { values: any[][] };
    const rows = json.values ?? [];

    for (let i = 0; i < rows.length; i++) {
      processed++;
      const sourceRowNumber = offset + i + 1; // 1-based, excluding header
      if (alreadyImported.has(sourceRowNumber)) {
        skippedExisting++;
        continue;
      }

      const row = rows[i];
      const refund = nullIfDash(row[C_REFUND]);
      if (refund && refund.toLowerCase().startsWith('y')) {
        skippedRefund++;
        continue;
      }

      const plateRaw = nullIfDash(row[C_PLATE]);
      if (!plateRaw) { skippedNoPlate++; continue; }
      const plateNorm = normalizePlate(plateRaw);
      if (!plateNorm) { skippedNoPlate++; continue; }

      const branchId = parseBranchId(row[C_STORE]);
      if (!branchId) { skippedBadBranch++; continue; }

      const dateSerial = Number(row[C_DATE]);
      const timeFrac = row[C_TIME] != null ? Number(row[C_TIME]) : 0;
      const eventAt = excelToDate(dateSerial, timeFrac);
      if (!eventAt) { skippedBadDate++; continue; }

      const totalCents = parseMoneyCents(row[C_TOTAL]);
      const paymentMethod = parsePaymentMethod(row[C_PAY] as any);
      const customerName = nullIfDash(row[C_CUST]);
      const brand = nullIfDash(row[C_BRAND]);
      const model = nullIfDash(row[C_MODEL]);
      const orderNotes = nullIfDash(row[C_NOTES]);
      const packageName = orderNotes ?? 'Legacy';

      if (DRY_RUN) {
        if (processed <= 5) {
          console.log(`#${sourceRowNumber}`, { eventAt: eventAt.toISOString(), branchId, plateNorm, totalCents, paymentMethod, brand, model, customerName, packageName });
        }
        inserted++;
        continue;
      }

      // Upsert car (cached). Select-by-normalised-plate first, insert if
      // missing, then bump last_seen_at + fill in brand/model when known.
      // We avoid ON CONFLICT here because cars_plate_normalized_unique is
      // an expression-based UNIQUE INDEX (not a constraint), which trips
      // up the neon-serverless driver's inference path.
      let carId = carCache.get(plateNorm);
      if (!carId) {
        const eventIso = eventAt.toISOString();
        const found = await db.execute(sql`
          SELECT id FROM cars
           WHERE UPPER(REGEXP_REPLACE(license_plate, '\\s+', '', 'g')) = ${plateNorm}
           LIMIT 1
        `);
        if (found.rows.length > 0) {
          carId = Number((found.rows[0] as any).id);
          await db.execute(sql`
            UPDATE cars
               SET brand        = COALESCE(brand, ${brand}),
                   model        = COALESCE(model, ${model}),
                   last_seen_at = GREATEST(COALESCE(last_seen_at, ${eventIso}::timestamptz), ${eventIso}::timestamptz)
             WHERE id = ${carId}
          `);
        } else {
          const ins = await db.execute(sql`
            INSERT INTO cars (license_plate, brand, model, last_seen_at)
            VALUES (${plateRaw}, ${brand}, ${model}, ${eventIso}::timestamptz)
            RETURNING id
          `);
          carId = Number((ins.rows[0] as any).id);
        }
        carCache.set(plateNorm, carId);
      } else {
        // Already cached — only bump last_seen_at if this row is later.
        const eventIso = eventAt.toISOString();
        await db.execute(sql`
          UPDATE cars
             SET last_seen_at = GREATEST(COALESCE(last_seen_at, ${eventIso}::timestamptz), ${eventIso}::timestamptz),
                 brand        = COALESCE(brand, ${brand}),
                 model        = COALESCE(model, ${model})
           WHERE id = ${carId}
        `);
      }

      // Insert the legacy order. Synthetic ticket_code = "L<rownum>".
      // status='done' is intentional: it's a completed historical wash AND
      // it sidesteps the sharepoint_outbox trigger (which only fires on
      // 'paid'|'queued') so we don't push these rows back to SharePoint.
      // ticket_day = the actual wash date (date column has a UTC default
      // we override). Used by orders_branch_ticket_day_uniq, so combined
      // with the L<rownum> ticket_code they're guaranteed unique.
      const ticketCode = `L${sourceRowNumber}`;
      const eventIsoOrder = eventAt.toISOString();
      const eventDate = eventIsoOrder.slice(0, 10);
      try {
        await db.execute(sql`
          INSERT INTO orders (
            id, ticket_code, ticket_day, branch_id, vehicle_id, plate,
            package_name, package_price_cents, total_cents, subtotal_cents,
            payment_method, status,
            customer_name_walkin, order_notes,
            created_at, completed_at,
            legacy_source, legacy_source_row_number
          ) VALUES (
            gen_random_uuid()::text, ${ticketCode}, ${eventDate}::date, ${branchId}, ${carId}, ${plateRaw},
            ${packageName}, ${totalCents}, ${totalCents}, ${totalCents},
            ${paymentMethod}, 'done',
            ${customerName}, ${orderNotes},
            ${eventIsoOrder}::timestamptz, ${eventIsoOrder}::timestamptz,
            'sharepoint', ${sourceRowNumber}
          )
        `);
        inserted++;
      } catch (err: any) {
        dbErrors++;
        if (dbErrors <= 5) console.warn(`row #${sourceRowNumber} insert failed: ${err.message ?? err}`);
      }
    }

    console.log(`[${Math.min(offset + CHUNK, toImport)}/${toImport}] processed=${processed} inserted=${inserted} skipped(noPlate=${skippedNoPlate} refund=${skippedRefund} existing=${skippedExisting} badDate=${skippedBadDate} badBranch=${skippedBadBranch}) dbErrors=${dbErrors}`);
  }

  // Refresh cached aggregates on cars.
  if (!DRY_RUN) {
    console.log('\nRefreshing cached visit count + spend on cars…');
    await db.execute(sql`
      UPDATE cars c
         SET total_visits      = sub.visits,
             total_spent_cents = sub.spent
        FROM (
          SELECT vehicle_id,
                 COUNT(*)::int        AS visits,
                 COALESCE(SUM(total_cents), 0)::int AS spent
            FROM orders
           WHERE vehicle_id IS NOT NULL AND status IN ('completed', 'done', 'paid')
           GROUP BY vehicle_id
        ) sub
       WHERE c.id = sub.vehicle_id
    `);
  }

  console.log('\n===== DONE =====');
  console.log(`processed: ${processed}`);
  console.log(`inserted:  ${inserted}`);
  console.log(`skipped:   noPlate=${skippedNoPlate} refund=${skippedRefund} existing=${skippedExisting} badDate=${skippedBadDate} badBranch=${skippedBadBranch}`);
  console.log(`dbErrors:  ${dbErrors}`);
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
