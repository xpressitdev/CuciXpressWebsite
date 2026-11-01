import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { getFinancialProfitLossReport } from "../server/profitLossService";

const dates = { startDate: "2025-11-01", endDate: "2026-10-31" };
const output = "generated-artifacts/CuciXpress-Sales-Expenses-Nov2025-Oct2026.xlsx";
const money = '"B$" #,##0.00;[Red]("B$" #,##0.00)';
try {
  const report = await db.transaction(async tx => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    await tx.execute(sql`SET LOCAL statement_timeout = '90s'`);
    return getFinancialProfitLossReport(2026, "overall", dates, tx);
  });
  assert.equal(report.months.length, 12);
  assert.equal(report.months[0].monthKey, "2025-11");
  assert.equal(report.months[11].monthKey, "2026-10");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CuciXpress";
  workbook.created = new Date();
  const notes = workbook.addWorksheet("Read me");
  notes.columns = [{ width: 30 }, { width: 110 }];
  notes.addRows([
    ["CUCIXPRESS", "Recorded sales and expenses"],
    ["Period", "1 November 2025–31 October 2026 (12 completed months)"],
    ["Currency / timezone", "BND / Asia/Brunei"],
    ["Scope", "Company-wide, using the app's existing P&L calculations and database snapshot."],
    ["Not a cashflow statement", "Revenue recognition and recorded expense dates are not bank settlement dates. No opening/closing cash balances, financing or investing cashflow is asserted."],
    ["Revenue basis", "POS net of refunds; online prepaid wash revenue on claim date; subscription revenue recognized over service periods; vouchers recognized on sale."],
    ["Expense basis", "Current eligible Connecteam submissions and app category allocations. Advance Salary is informational and excluded. MDR includes the app's calculated payment fees."],
    ["Data coverage", report.coverage.status],
    ["Coverage note", report.coverage.note],
    ["Last successful expense sync", "lastSuccessfulAt" in report.sync ? String(report.sync.lastSuccessfulAt ?? "Unavailable") : "Unavailable"],
    ["Sync status", report.sync.status],
    ["Missing depreciation months", report.coverage.depreciationMissingMonths.join(", ") || "None"],
    ["Missing-value policy", "Blank depreciation/net profit means depreciation is incomplete. Recorded zero values do not establish complete source coverage; see Coverage."],
    ["Summary surplus", "Revenue less COS, OPEX and unmapped expenses; before depreciation. This is not cash generated."],
    ["Generated (UTC)", new Date().toISOString()],
  ]);
  const summary = workbook.addWorksheet("Monthly summary");
  summary.addRow(["Month", "Recorded revenue", "Cost of services", "Operating expenses incl MDR", "Unmapped expenses", "Total expenses before depreciation", "Surplus before depreciation", "Depreciation", "Net profit", "Depreciation coverage"]);
  const detail = workbook.addWorksheet("Category breakdown");
  detail.addRow(["Category", ...report.months.map(m => m.monthKey), "Period total"]);
  const keys = report.months[0].lines.filter(l => l.key !== "profit_margin_bps");
  const missing = new Set(report.coverage.depreciationMissingMonths);
  for (const line of keys) {
    const values = report.months.map(m => {
      if (["depreciation", "net_profit"].includes(line.key) && missing.has(m.monthKey)) return null;
      return (m.lines.find(l => l.key === line.key)?.cents ?? 0) / 100;
    });
    const r = detail.rowCount + 1;
    detail.addRow([line.label, ...values, values.some(v => v === null) ? null : {
      formula: `SUM(B${r}:M${r})`, result: values.reduce<number>((n, v) => n + (v ?? 0), 0),
    }]);
    assert.equal(report.months.reduce((n, m) => n + (m.lines.find(l => l.key === line.key)?.cents ?? 0), 0), report.ytd[line.key]);
  }
  for (const m of report.months) {
    const v = Object.fromEntries(m.lines.map(l => [l.key, l.cents / 100]));
    const r = summary.rowCount + 1;
    const exp = v.cost_of_services + v.operating_expense + v.unmapped_expenses;
    summary.addRow([m.monthKey, v.revenue, v.cost_of_services, v.operating_expense, v.unmapped_expenses,
      { formula: `SUM(C${r}:E${r})`, result: exp },
      { formula: `B${r}-F${r}`, result: v.revenue - exp },
      missing.has(m.monthKey) ? null : v.depreciation,
      missing.has(m.monthKey) ? null : v.net_profit,
      missing.has(m.monthKey) ? "Incomplete" : "Configured",
    ]);
  }
  const total = summary.addRow(["Period total"]);
  for (let c = 2; c <= 9; c++) {
    if (c >= 8 && missing.size) continue;
    const letter = summary.getColumn(c).letter;
    let sum = 0;
    for (let r = 2; r <= 13; r++) {
      const value = summary.getCell(r, c).value;
      sum += typeof value === "number" ? value : Number((value as any)?.result ?? 0);
    }
    total.getCell(c).value = { formula: `SUM(${letter}2:${letter}13)`, result: sum };
  }
  total.font = { bold: true };
  const coverage = workbook.addWorksheet("Coverage");
  coverage.columns = [{ width: 44 }, { width: 100 }];
  coverage.addRow(["Coverage item", "Details"]);
  for (const [key, value] of Object.entries(report.coverage.ranges.observed))
    coverage.addRow([key, JSON.stringify(value)]);
  for (const warning of report.coverage.warnings)
    coverage.addRow([warning.code, JSON.stringify(warning)]);
  if (!report.coverage.warnings.length) coverage.addRow(["Warnings", "None reported"]);
  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1, xSplit: sheet === detail ? 1 : 0 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF163A43" } };
    sheet.getRow(1).height = 34;
    sheet.eachRow(row => row.eachCell(cell => {
      cell.alignment = { vertical: "middle", wrapText: true };
    }));
    if (sheet === summary || sheet === detail) {
      sheet.columns.forEach((col, i) => { col.width = i === 0 ? 40 : 23; });
      sheet.eachRow((row, r) => { if (r > 1) row.eachCell((cell, c) => {
        if (c > 1 && (sheet === detail || c < 10)) cell.numFmt = money;
      }); });
      sheet.autoFilter = { from: "A1", to: { row: sheet.rowCount - (sheet === summary ? 1 : 0), column: sheet.columnCount } };
    } else {
      sheet.eachRow((row, r) => { if (r > 1) row.height = 48; });
    }
  }
  await mkdir("generated-artifacts", { recursive: true });
  await workbook.xlsx.writeFile(output);
  const verified = new ExcelJS.Workbook();
  await verified.xlsx.readFile(output);
  assert.equal(verified.worksheets.length, 4);
  assert.equal(verified.getWorksheet("Monthly summary")!.rowCount, 14);
  assert.equal(verified.getWorksheet("Monthly summary")!.getCell("B14").result, report.ytd.revenue / 100);
  console.log(JSON.stringify({ output, revenue: report.ytd.revenue / 100, coverage: report.coverage, sync: report.sync }, null, 2));
} finally {
  await pool.end();
}
