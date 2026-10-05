import fs from "node:fs";
import { getProfitLossReport } from "../server/profitLossService";
import { pool } from "../server/db";

async function main() {
  const q3 = await getProfitLossReport(2026, "overall", { startDate: "2026-07-01", endDate: "2026-09-30" });
  const q2 = await getProfitLossReport(2026, "overall", { startDate: "2026-04-01", endDate: "2026-06-30" });
  const branches = [];
  for (const b of q3.branches as Array<{id: string; name: string}>) {
    const report = await getProfitLossReport(2026, String(b.id), { startDate: "2026-07-01", endDate: "2026-09-30" });
    branches.push({ id:b.id, name:b.name, totals:report.ytd, months:report.months, coverage:report.coverage });
  }
  const result = { extractedAt: new Date().toISOString(), source: "Shared external Neon database; current application P&L computation", q3, q2, branches };
  fs.mkdirSync(".local/outputs/q3-2026", { recursive:true });
  fs.writeFileSync(".local/outputs/q3-2026/financial-snapshot.json", JSON.stringify(result,null,2));
  console.log(JSON.stringify({extractedAt:result.extractedAt,q3:q3.ytd,q2:q2.ytd,coverage:q3.coverage,
    branches:branches.map(b=>({name:b.name,totals:b.totals,missingDepreciation:b.coverage.depreciationMissingMonths})),
    monthly:q3.months.map(m=>({month:m.month,lines:m.lines}))},null,2));
}
main().finally(()=>pool.end()).catch(e=>{console.error(e.message);process.exitCode=1});
