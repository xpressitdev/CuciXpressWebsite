// One-pass cleanup: convert TEXT values in money columns M-T of the master
// Excel file into real numbers (text "-"/"$ -" -> 0; number-stored-as-text
// like "8" -> 8; real numbers left untouched; genuinely blank/empty cells left
// unchanged rather than fabricating a 0). Text columns are never touched.
// Read-safe, retries on transient Graph errors. Logs progress to a file so it can
// be run as a background workflow. Set DRY=1 to count without writing.
import { loadSharePointConfig } from '../server/integrations/sharepoint';
import { writeFileSync, appendFileSync } from 'fs';

const OUT = '.local/state/fix_money.txt';
const DRY = process.env.DRY === '1';
const COLS = ['M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
const NAMES = ['Subtotal', 'Discount', 'Promo', 'SvcChg', 'Tax', 'OrderTotal', 'Paid', 'Change'];
const BATCH = 5000;

function log(s: string) { appendFileSync(OUT, s + '\n'); }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function convert(val: any, vt: any): { out: any; changed: boolean } {
  if (vt === 'Double' || vt === 'Int32' || vt === 'Currency') return { out: val, changed: false };
  if (vt === 'Empty') return { out: null, changed: false };
  const s = String(val ?? '').trim();
  if (s === '') return { out: null, changed: false };
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return { out: 0, changed: true };
  const n = Number(cleaned);
  return { out: Number.isFinite(n) ? n : 0, changed: true };
}

async function graph(url: string, tok: string, init?: RequestInit): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${tok}`, ...(init?.headers || {}) } });
    if (res.ok) return res.status === 204 ? {} : res.json();
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || (2 ** attempt) * 1000;
      log(`  [retry ${attempt}] ${res.status} waiting ${wait}ms`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Graph ${res.status}: ${await res.text()}`);
  }
  throw new Error('Graph: exhausted retries');
}

async function main() {
  writeFileSync(OUT, `fix-money ${DRY ? '(DRY RUN)' : '(LIVE)'} started ${new Date().toISOString()}\n`);
  const cfg = loadSharePointConfig()!;
  const tokRes = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
  });
  const tok = (await tokRes.json() as any).access_token;
  const encodedFilePath = cfg.filePath.split('/').map(encodeURIComponent).join('/');
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.userEmail)}/drive/root:${encodedFilePath}`;
  const tableUrl = `${base}:/workbook/tables/${encodeURIComponent(cfg.tableName)}`;
  const range = await graph(`${tableUrl}/range?$select=address`, tok);
  const m = String(range.address).match(/^([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
  const sheetName = m[1].replace(/^'|'$/g, '');
  const headerRow = Number(m[3]);
  const lastRow = Number(m[5]);
  const firstData = headerRow + 1;
  log(`sheet=${sheetName} dataRows=${lastRow - headerRow} (${firstData}..${lastRow})`);
  const ws = `${base}:/workbook/worksheets('${encodeURIComponent(sheetName)}')`;

  const changed = COLS.map(() => 0);
  let batchesWritten = 0;

  for (let start = firstData; start <= lastRow; start += BATCH) {
    const end = Math.min(start + BATCH - 1, lastRow);
    const addr = `M${start}:T${end}`;
    const j = await graph(`${ws}/range(address='${encodeURIComponent(addr)}')?$select=values,valueTypes`, tok);
    const values: any[][] = j.values ?? [];
    const vts: any[][] = j.valueTypes ?? [];
    const out: any[][] = [];
    let batchChanged = false;
    for (let r = 0; r < values.length; r++) {
      const row: any[] = [];
      for (let c = 0; c < COLS.length; c++) {
        const { out: o, changed: ch } = convert(values[r][c], vts[r][c]);
        row.push(o);
        if (ch) { changed[c]++; batchChanged = true; }
      }
      out.push(row);
    }
    if (batchChanged && !DRY) {
      await graph(`${ws}/range(address='${encodeURIComponent(addr)}')`, tok, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: out }),
      });
      batchesWritten++;
    }
    log(`  rows ${start}..${end} ${batchChanged ? (DRY ? '(would write)' : 'written') : '(no change)'}`);
  }

  log('\nper-column cells converted:');
  COLS.forEach((L, i) => log(`  ${L} ${NAMES[i].padEnd(11)} ${changed[i]}`));
  log(`\nTOTAL converted: ${changed.reduce((a, b) => a + b, 0)} | batches written: ${batchesWritten}`);
  log('DONE');
}
main().catch((e) => { log('ERROR ' + (e?.stack || e)); });
