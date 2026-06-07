// Peek at the TAIL of the SharePoint master table to verify how newly added
// rows are laid out relative to the last imported row (131764 = June 1).
import { loadSharePointConfig } from '../server/integrations/sharepoint';

function excelDate(serial: number): string {
  if (!Number.isFinite(serial) || serial <= 0) return '';
  const ms = (serial - 25569) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function main() {
  const cfg = loadSharePointConfig()!;
  const tokRes = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
      grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const tok = (await tokRes.json() as any).access_token;
  const encodedFilePath = cfg.filePath.split('/').map(encodeURIComponent).join('/');
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.userEmail)}/drive/root:${encodedFilePath}`;
  const tableUrl = `${base}:/workbook/tables/${encodeURIComponent(cfg.tableName)}`;
  const rangeRes = await fetch(`${tableUrl}/range?$select=address,rowCount`, { headers: { Authorization: `Bearer ${tok}` } });
  const range = await rangeRes.json() as { address: string; rowCount: number };
  const m = range.address.match(/^([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
  const sheetName = m[1].replace(/^'|'$/g, '');
  const headerRow = Number(m[3]);
  const lastSheetRow = Number(m[5]);
  const totalDataRows = range.rowCount - 1;
  console.log(`sheet=${sheetName} headerRow=${headerRow} lastSheetRow=${lastSheetRow} totalDataRows=${totalDataRows}`);
  console.log(`(last imported sourceRowNumber=131764 -> sheet row ${headerRow + 131764})`);

  // Window: sourceRowNumber 131758..end. Sheet row = headerRow + N.
  const startN = 131758;
  const loRow = headerRow + startN;
  const hiRow = Math.min(lastSheetRow, headerRow + 131800);
  const addr = `A${loRow}:Y${hiRow}`;
  const dRes = await fetch(`${base}:/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${addr}')?$select=values`, { headers: { Authorization: `Bearer ${tok}` } });
  const dJson = await dRes.json() as { values: any[][] };
  console.log(`\nRows ${startN}..${totalDataRows} (C=date E=store L=pay R=total Y=plate):`);
  dJson.values.forEach((row, i) => {
    const n = startN + i;
    const dateSerial = Number(row[2]);
    console.log(`  #${n}: date=${excelDate(dateSerial)} store=${JSON.stringify(row[4])} pay=${JSON.stringify(row[11])} total=${JSON.stringify(row[17])} plate=${JSON.stringify(row[24])}`);
  });
}
main().catch(e => { console.error(e); process.exit(1); });
