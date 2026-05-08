// Peek at first/last/random Excel rows to see raw column values.
import { loadSharePointConfig } from '../server/integrations/sharepoint';

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
  const rangeRes = await fetch(`${tableUrl}/range?$select=address`, { headers: { Authorization: `Bearer ${tok}` } });
  const range = await rangeRes.json() as { address: string };
  const m = range.address.match(/^([^!]+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
  const sheetName = m[1].replace(/^'|'$/g, '');
  console.log('sheet=', sheetName, 'cols=', m[2], '->', m[4], 'rows=', m[3], '->', m[5]);

  // Headers
  const hRes = await fetch(`${base}:/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${m[2]}${m[3]}:${m[4]}${m[3]}')?$select=values`, { headers: { Authorization: `Bearer ${tok}` } });
  const hJson = await hRes.json() as { values: any[][] };
  console.log('\nHEADERS:');
  hJson.values[0].forEach((v, i) => {
    const letter = String.fromCharCode(65 + i);
    console.log(`  ${letter} (${i}): ${JSON.stringify(v)}`);
  });

  // First 3 data rows
  const firstData = Number(m[3]) + 1;
  const dRes = await fetch(`${base}:/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${m[2]}${firstData}:${m[4]}${firstData + 2}')?$select=values`, { headers: { Authorization: `Bearer ${tok}` } });
  const dJson = await dRes.json() as { values: any[][] };
  console.log('\nFIRST 3 ROWS:');
  dJson.values.forEach((row, i) => {
    console.log(`Row ${i+1}:`);
    row.forEach((v, j) => {
      const letter = String.fromCharCode(65 + j);
      console.log(`  ${letter}: ${JSON.stringify(v)}`);
    });
  });

  // Sample 3 random rows from middle
  const total = Number(m[5]) - Number(m[3]);
  const samples = [Math.floor(total*0.25), Math.floor(total*0.5), Math.floor(total*0.75)];
  for (const s of samples) {
    const r = firstData + s;
    const rRes = await fetch(`${base}:/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${m[2]}${r}:${m[4]}${r}')?$select=values`, { headers: { Authorization: `Bearer ${tok}` } });
    const rJson = await rRes.json() as { values: any[][] };
    console.log(`\nROW ${r} (${s}/${total}):`);
    rJson.values[0].forEach((v, j) => {
      const letter = String.fromCharCode(65 + j);
      console.log(`  ${letter}: ${JSON.stringify(v)}`);
    });
  }

  // Distinct values of column E (Store Name) — top 20 by appearance
  console.log('\nSampling column E to find distinct branch names...');
  const eRes = await fetch(`${base}:/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='E${firstData}:E${firstData + 199}')?$select=values`, { headers: { Authorization: `Bearer ${tok}` } });
  const eJson = await eRes.json() as { values: any[][] };
  const counts = new Map<string, number>();
  for (const row of eJson.values) {
    const v = String(row[0] ?? '').trim();
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  console.log('Column E distinct (first 200 rows):');
  for (const [v, n] of [...counts.entries()].sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${JSON.stringify(v)}`);
  }
}
main().catch(console.error);
