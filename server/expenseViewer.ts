import { PNL_CATEGORIES } from "../shared/profitLoss";

const allowedKeys = new Set([
  ...PNL_CATEGORIES.map(category => `expense:${category.category}`),
  "cost_of_services", "merchant_discount_rate", "operating_expense", "unmapped_expenses",
]);

/** Construct a fresh allowlisted payload; never spread owner report metadata. */
export function expenseOnlyReport(report: any) {
  return {
    expenseView: true,
    year: report.year,
    branchId: report.branchId,
    branches: report.branches.map((b: any) => ({ id: b.id, name: b.name })),
    dateRange: report.dateRange,
    totalLabel: report.totalLabel,
    months: report.months.map((m: any) => ({
      year: m.year, month: m.month, monthKey: m.monthKey,
      lines: m.lines.filter((line: any) => allowedKeys.has(line.key))
        .map((line: any) => ({ key: line.key, label: line.label, cents: line.cents })),
    })),
    ytd: Object.fromEntries(Object.entries(report.ytd).filter(([key]) => allowedKeys.has(key))),
    coverage: { status: report.coverage.status, note: "Cost of services and operating expenses only.", depreciationMissingMonths: [] },
    sync: { status: report.sync.status, lastSuccessfulAt: report.sync.lastSuccessfulAt },
  };
}