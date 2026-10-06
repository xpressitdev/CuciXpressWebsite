import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { getFinancialProfitLossReport, type FinancialRecognition } from "./profitLossService";
import { buildFinancialLines, categoryTotals, cents, FINANCIAL_ACCOUNTS, fingerprint, reconcileFinancialLines } from "./financialExportModel";
import type { investorPeriod } from "./investorPerformance";

type Report = Awaited<ReturnType<typeof getFinancialProfitLossReport>>;
function disclosedReport(report: Report) {
  const missing = new Set(report.coverage.depreciationMissingMonths);
  const redact = (values: Record<string, number>, incomplete: boolean) => ({
    ...values,
    depreciation: incomplete ? null : values.depreciation,
    net_profit: incomplete ? null : values.net_profit,
    profit_margin_bps: incomplete || values.revenue === 0 ? null : values.profit_margin_bps,
  });
  return {
    totals: redact(report.ytd, missing.size > 0),
    months: report.months.map(m => ({
      month: m.monthKey, values: redact(Object.fromEntries(m.lines.map(l => [l.key, l.cents])), missing.has(m.monthKey)),
      depreciationComplete: !missing.has(m.monthKey),
    })),
    coverage: {
      status: report.coverage.status, depreciationMissingMonths: Array.from(missing),
      observed: report.coverage.ranges.observed,
      // Only machine codes/counts, not upstream errors or free-text source fields.
      warnings: report.coverage.warnings.map(w => ({ code: w.code, count: w.count })),
    },
  };
}
const unavailable = (reason: string) => ({ availability: "unavailable", complete: false, records: null, reason });

export async function generateFinancialExport(period: ReturnType<typeof investorPeriod>) {
  return db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);
    const dates = { startDate: period.startDate, endDate: period.endDate };
    const recognized: FinancialRecognition[] = [];
    const overall = await getFinancialProfitLossReport(period.year, "overall", dates, tx, r => recognized.push(r));
    const branches: Array<{ id: string; name: string; report: Report }> = [];
    for (const b of overall.branches) {
      const report = await getFinancialProfitLossReport(period.year, String(b.id), dates, tx);
      branches.push({ id: String(b.id), name: String(b.name), report });
    }
    const [orders, expenses, vouchers, depreciation, fees] = await Promise.all([
      tx.execute(sql`
        SELECT o.id, o.branch_id, o.total_cents, o.status, o.payment_method, o.qr_provider,
          o.created_at, o.refunded_at, (o.legacy_source IS NOT NULL) AS is_legacy,
          date((CASE WHEN o.qr_provider='pocket_pay' THEN o.claimed_at ELSE o.created_at END)
            AT TIME ZONE 'Asia/Brunei')::text AS accounting_date
        FROM orders o
        WHERE COALESCE(o.order_type,'') NOT IN ('counter_subscription','interior_refresh_promo')
          AND date((CASE WHEN o.qr_provider='pocket_pay' THEN o.claimed_at ELSE o.created_at END)
            AT TIME ZONE 'Asia/Brunei') BETWEEN ${period.startDate}::date AND ${period.endDate}::date
        ORDER BY o.id
      `),
      tx.execute(sql`
        SELECT s.submission_id, s.expense_date::text, s.source_updated_at,
          s.is_present, s.is_eligible, s.source_category,
          a.allocation_key, a.branch_id, a.pnl_category, a.allocation_status, a.cents,
          GREATEST(a.updated_at,s.updated_at) AS updated_at,
          (s.expense_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date) AS in_period
        FROM pnl_expense_allocations a
        JOIN connecteam_expense_submissions s ON s.id=a.connecteam_expense_submission_id
        WHERE s.form_id='6495602' AND (
          s.expense_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
          OR (s.expense_date IS NULL AND s.is_present))
        ORDER BY s.submission_id,a.allocation_key
      `),
      tx.execute(sql`
        SELECT id,sale_date::text,total_cents,branch_id,status,created_at
        FROM voucher_sales WHERE sale_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
        ORDER BY id
      `),
      tx.execute(sql`
        SELECT year,month,branch_id,cents,updated_at FROM pnl_depreciation_settings
        WHERE year=${period.year} AND month BETWEEN ${(period.quarter - 1) * 3 + 1} AND ${period.quarter * 3}
        ORDER BY year,month,branch_id
      `),
      tx.execute(sql`SELECT payment_method,qr_provider,mdr_bps FROM payment_fee_rates ORDER BY payment_method,qr_provider`),
    ]);
    const details = buildFinancialLines({
      orders: orders.rows, expenses: expenses.rows, vouchers: vouchers.rows,
      depreciation: depreciation.rows, recognitions: recognized, feeRates: fees.rows,
    });
    if (details.transactions.length > 250_000) throw Error("export_too_large");
    const branchIds = new Set(branches.map(b => b.id));
    const checks = [
      ...reconcileFinancialLines(details.transactions, overall).map(c => ({ scope: "company", ...c })),
      ...branches.flatMap(b => reconcileFinancialLines(details.transactions.filter(l => l.branchId === b.id), b.report)
        .map(c => ({ scope: `branch:${b.id}`, ...c }))),
    ];
    // Verify branch + central and month -> quarter totals separately from detail checks.
    const central = Object.fromEntries(Object.entries(overall.ytd).filter(([key]) => key !== "profit_margin_bps")
      .map(([key, value]) => [key, value - branches.reduce((n, b) => n + cents(b.report.ytd[key]), 0)]));
    const monthChecks = Object.entries(overall.ytd).filter(([key]) => key !== "profit_margin_bps").map(([key, total]) => {
      const sum = overall.months.reduce((n, m) => n + (m.lines.find(l => l.key === key)?.cents ?? 0), 0);
      return { pnlKey: key, monthlyCents: sum, quarterlyCents: total, differenceCents: sum - total };
    });
    const disclosed = disclosedReport(overall);
    const generatedAt = new Date().toISOString();
    const payload = {
      schemaVersion: 1, exportId: randomUUID(), generatedAt, currency: "BND", amountUnit: "cents",
      requestedPeriod: period, actualCoverage: disclosed.coverage.observed,
      latestSuccessfulExpenseSyncAt: "lastSuccessfulAt" in overall.sync ? overall.sync.lastSuccessfulAt : null,
      consistency: {
        mode: "single_response_repeatable_read_read_only_transaction",
        pagination: null, completeResponseRequired: true,
        note: "All records and calculations share one DB snapshot. A new request creates a new export; save the entire validated response.",
      },
      accounts: {
        availability: "reporting_mappings_only", statutoryChartOfAccountsAvailable: false,
        records: FINANCIAL_ACCOUNTS,
        priorInvestorAccountMapping: "unavailable: January–June investor account codes are not held in this source app; map explicitly by category, never silently.",
        subcategories: null,
      },
      statements: {
        company: disclosed,
        branches: branches.map(b => ({ id: b.id, name: b.name, ...disclosedReport(b.report) })),
        centralAndNoncanonical: {
          totals: { ...central,
            depreciation: disclosed.totals.depreciation === null ? null : central.depreciation,
            net_profit: disclosed.totals.net_profit === null ? null : central.net_profit },
          note: "Company less the five canonical branches. No arbitrary allocation; unknown branch attribution remains central/noncanonical.",
        },
      },
      datasets: {
        financialContributions: {
          availability: "available", complete: checks.every(c => c.differenceCents === 0),
          count: details.transactions.length, records: details.transactions,
          note: "P&L contributions include actual source transactions and explicitly labelled derived recognition/fee/depreciation lines. They are not double-entry journals or bank movements.",
        },
        categoryTotals: { availability: "available", records: categoryTotals(details.transactions, branchIds) },
        exclusionsAndExceptions: {
          availability: "available", complete: false, records: details.exclusions,
          note: "Current excluded records and undated expense exceptions, not a complete mutation/deletion audit. Undated exceptions are not attributed to Q3.",
        },
        depreciationCharges: {
          availability: "available", complete: disclosed.coverage.depreciationMissingMonths.length === 0,
          records: details.transactions.filter(l => l.accountCode === "EXP.DEPRECIATION"),
          note: "Owner-configured monthly branch charges; no asset-level derivation is recorded.",
        },
        journalEntries: unavailable("This app has no accounting journal ledger with balanced debit/credit lines."),
        balances: unavailable("No accounting opening balances, general-ledger period movements or closing balances are maintained."),
        cashFlow: unavailable("Sales/expense records do not constitute a reconciled cash/bank ledger; bank balances and cash-flow classifications are not maintained."),
        fixedAssets: unavailable("No fixed-asset register with acquisition cost, residual value, useful life or accumulated depreciation is maintained."),
        completeRevisionHistory: unavailable("This export supplies current records and content revisions, not a complete historical accounting audit trail."),
      },
      reconciliation: {
        status: checks.every(c => c.differenceCents === 0) && monthChecks.every(c => c.differenceCents === 0) ? "matched" : "differences",
        checks, monthlyToQuarterly: monthChecks,
        basis: "Same P&L computation as the public summary, evaluated in this export's single database snapshot. A separately fetched public response may be cached or reflect later revisions.",
        recordedDepreciationOnly: true,
      },
      reportingPolicies: [
        "Unaudited management P&L, not complete BDAS financial statements.",
        "Amounts are signed integer BND cents. Current source revisions may differ from previously issued reports; keep those reports unchanged.",
        "Reported profit = EBITDA minus configured depreciation. Financing and income tax are not separately modelled.",
        "POS is net of refunds, using the original realization day; web Pocket Pay uses claimed_at in Asia/Brunei. Refund event timestamps are separately retained where held.",
        "Legacy refund signs follow the existing P&L exactly. Gross/refund fields retain source signs rather than assuming refunds are positive.",
        "Counter subscriptions use queued 30-day service periods per vehicle; paid invoices use recorded service periods. Legacy subscriptions without paid invoices use the existing 30-day fallback.",
        "MDR uses current fee settings, rounded per POS month/branch/payment group, or spread over subscription service days. Historical fee-rate revisions can restate calculations.",
        "Paid physical vouchers are recognised fully at sale; redemption adds no revenue.",
        "Advance Salary is informational, not an expense; duplicate MDR expenses are excluded.",
        "Full-quarter depreciation uses the configured monthly charges. A recorded zero charge is valid; missing configuration is not a zero charge.",
        "Stable IDs identify source contributions; SHA-256 revisions detect content changes. Source update timestamps are null where no reliable timestamp exists.",
        "Monthly owner-triggered import and approval only. Do not fetch on public page loads, poll, or expose the export/credential to visitors.",
      ],
    };
    return { ...payload, contentFingerprint: fingerprint({
      period, statements: payload.statements, datasets: payload.datasets, accounts: payload.accounts,
    }) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
