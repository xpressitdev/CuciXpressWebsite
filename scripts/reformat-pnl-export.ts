import ExcelJS from "exceljs";
import assert from "node:assert/strict";

const source = new ExcelJS.Workbook();
await source.xlsx.readFile("generated-artifacts/CuciXpress-Sales-Expenses-Nov2025-Oct2026.xlsx");
const original = source.getWorksheet("Category breakdown")!;
const book = new ExcelJS.Workbook();
book.creator = "CuciXpress";
const sheet = book.addWorksheet("Profit and Loss", {
  views: [{ state: "frozen", xSplit: 1, ySplit: 1, showGridLines: false }],
  pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
});
original.eachRow(row => sheet.addRow(row.values));
sheet.getCell("A1").value = "P&L line (BND)";
for (let c = 2; c <= 13; c++) {
  const key = String(original.getCell(1, c).value);
  sheet.getCell(1, c).value = new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
sheet.getCell("N1").value = "Period total";
const rowByLabel = new Map<string, number>();
sheet.eachRow((row, r) => rowByLabel.set(String(row.getCell(1).value), r));
const profit = rowByLabel.get("Net Profit")!;
const revenue = rowByLabel.get("Revenue")!;
const margin = sheet.addRow(["Profit Margin"]);
for (let c = 2; c <= 14; c++) {
  const p = sheet.getCell(profit, c);
  const rev = sheet.getCell(revenue, c);
  if (p.value === null) continue;
  const pval = typeof p.value === "number" ? p.value : Number(p.result);
  const rval = typeof rev.value === "number" ? rev.value : Number(rev.result);
  const letter = sheet.getColumn(c).letter;
  margin.getCell(c).value = {
    formula: `IFERROR(${letter}${profit}/${letter}${revenue},0)`,
    result: rval === 0 ? 0 : Math.round(pval * 10000 / rval) / 10000,
  };
}
const totals = new Set(["Revenue", "Total COS", "Gross Profit", "Total OPEX", "EBITDA", "Net Profit", "Profit Margin"]);
sheet.columns.forEach((col, index) => { col.width = index === 0 ? 38 : 21; });
sheet.eachRow((row, r) => {
  const total = totals.has(String(row.getCell(1).value));
  row.height = r === 1 ? 32 : 46;
  for (let c = 1; c <= 14; c++) {
    const cell = row.getCell(c);
    cell.font = { name: "Arial", size: 10, bold: total || c === 14, color: { argb: r === 1 ? "FF777777" : "FF222222" } };
    cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "right", wrapText: true };
    cell.border = { bottom: { style: "hair", color: { argb: "FFE0E0E0" } }, ...(c === 1 ? { right: { style: "thin" as const, color: { argb: "FFE0E0E0" } } } : {}) };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: total ? "FFF4F4F3" : "FFFFFFFF" } };
    if (r > 1 && c > 1) cell.numFmt = r === margin.number ? "0.00%" : '"BND " #,##0.00;[Red]("BND " #,##0.00)';
  }
});
sheet.pageSetup.printTitlesRow = "1:1";
sheet.pageSetup.printTitlesColumn = "A:A";
sheet.headerFooter.oddHeader = "CuciXpress — Profit and Loss | Nov 2025–Oct 2026";
sheet.headerFooter.oddFooter = "Recorded figures — see Notes and Coverage | Page &P of &N";
for (const [from, to] of [["Read me", "Notes"], ["Coverage", "Coverage"]]) {
  const src = source.getWorksheet(from)!;
  const dest = book.addWorksheet(to);
  dest.columns = [{ width: 32 }, { width: 110 }];
  src.eachRow(row => {
    const added = dest.addRow(row.values);
    added.height = 48;
    added.eachCell(cell => { cell.alignment = { wrapText: true, vertical: "middle" }; });
  });
}
book.getWorksheet("Notes")!.addRow(["Total column", "Period total covers Nov 2025–Oct 2026; it is not calendar-year YTD. Layout matches the P&L tab."]);
const path = "generated-artifacts/CuciXpress-Profit-and-Loss-Nov2025-Oct2026.xlsx";
await book.xlsx.writeFile(path);
const check = new ExcelJS.Workbook();
await check.xlsx.readFile(path);
const verified = check.worksheets[0];
assert.equal(verified.name, "Profit and Loss");
assert.equal(verified.columnCount, 14);
assert.equal(verified.getCell(revenue, 14).result, 341389.36);
for (let r = 2; r <= original.rowCount; r++)
  for (let c = 2; c <= 14; c++)
    assert.deepEqual(verified.getCell(r, c).value, original.getCell(r, c).value);
console.log(`Verified all original figures unchanged: ${path}`);
