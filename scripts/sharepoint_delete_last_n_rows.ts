// One-off cleanup: delete the last N rows from the SharePoint Excel table.
// Usage: tsx scripts/sharepoint_delete_last_n_rows.ts <N>
import { loadSharePointConfig } from '../server/integrations/sharepoint';

async function main() {
  const N = parseInt(process.argv[2] ?? '3', 10);
  if (!Number.isFinite(N) || N <= 0 || N > 50) {
    console.error('refusing: N must be 1..50');
    process.exit(1);
  }
  const cfg = loadSharePointConfig();
  if (!cfg) { console.error('SharePoint not configured'); process.exit(1); }

  // 1) Token
  const tokRes = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  if (!tokRes.ok) { console.error('token failed', await tokRes.text()); process.exit(1); }
  const tok = (await tokRes.json() as any).access_token;

  // 2) Resolve drive item path
  const encodedFilePath = cfg.filePath.split('/').map(encodeURIComponent).join('/');
  const base = cfg.driveType === 'user'
    ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.userEmail)}/drive/root:${encodedFilePath}`
    : (() => { throw new Error('site mode not handled in this one-off'); })();
  const tableUrl = `${base}:/workbook/tables/${encodeURIComponent(cfg.tableName)}`;

  // 3) Get total row count via the table's data range address.
  //    The /rows/$count endpoint times out on large tables, but
  //    /range?$select=address returns instantly.
  const rangeRes = await fetch(`${tableUrl}/range?$select=address,rowCount`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (!rangeRes.ok) { console.error('range failed', await rangeRes.text()); process.exit(1); }
  const rangeJson = await rangeRes.json() as { address: string; rowCount: number };
  // rowCount includes the header row, so data rows = rowCount - 1
  const total = rangeJson.rowCount - 1;
  console.log(`Table range = ${rangeJson.address}, data rows = ${total}.`);

  // 4) Delete from the bottom up so indexes stay stable.
  for (let i = 0; i < N; i++) {
    const idx = total - 1 - i;
    const delUrl = `${tableUrl}/rows/itemAt(index=${idx})`;
    const r = await fetch(delUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) { console.error(`delete idx=${idx} failed`, await r.text()); process.exit(1); }
    console.log(`Deleted row index ${idx}`);
  }
  console.log(`Done. Removed ${N} rows.`);
}

main().catch(e => { console.error(e); process.exit(1); });
