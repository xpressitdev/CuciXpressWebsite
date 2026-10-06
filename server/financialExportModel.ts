import { createHash } from "node:crypto";
import { isInformationalPnlExpense, PNL_CATEGORIES, type PnlCategory } from "@shared/profitLoss";
import type { FinancialRecognition } from "./profitLossService";

// Export mapping codes, not a claim that this app has a statutory chart of accounts.
const CODES: Record<PnlCategory, string> = {
  "Water Bill": "COS.WATER", "Electricity Bill": "COS.ELECTRICITY",
  "Car Wash Shampoo & Tyre Shine + Car Wax": "COS.WASH_SUPPLIES",
  "Staff Wages": "COS.STAFF_WAGES", "Part-timer Wages": "COS.PART_TIME_WAGES",
  "Bonus": "COS.BONUS", "Miscellaneous": "COS.MISCELLANEOUS",
  "Maintenance & Repair": "COS.MAINTENANCE", "Total Units Rental": "OPEX.RENT",
  "Point-of-Sale System": "OPEX.POS_SYSTEM", "Wifi Internet": "OPEX.INTERNET",
  "SPK": "OPEX.SPK", "Connecteam (Employee Management App)": "OPEX.EMPLOYEE_SOFTWARE",
  "Barang Harian Serbaguna": "OPEX.GENERAL_SUPPLIES", "Foods & Drink": "OPEX.FOOD",
  "Management Fee": "OPEX.MANAGEMENT", "Merchant Discount Rate (MDR)": "OPEX.MDR",
};
export const FINANCIAL_ACCOUNTS = [
  { code: "REV.POS", label: "POS revenue net of refunds", pnlKey: "pos_net_revenue", section: "revenue" },
  { code: "REV.SUBSCRIPTION", label: "Recognised subscriptions", pnlKey: "recognized_subscription_revenue", section: "revenue" },
  { code: "REV.VOUCHER", label: "Paid voucher sales", pnlKey: "voucher_sales_revenue", section: "revenue" },
  ...PNL_CATEGORIES.map(c => ({
    code: CODES[c.category], label: c.category, section: c.section,
    pnlKey: c.category === "Merchant Discount Rate (MDR)" ? "merchant_discount_rate" : `expense:${c.category}`,
  })),
  { code: "EXP.UNMAPPED", label: "Unmapped expenses", pnlKey: "unmapped_expenses", section: "unmapped" },
  { code: "EXP.DEPRECIATION", label: "Configured depreciation charge", pnlKey: "depreciation", section: "depreciation" },
];
export const categoryCode = (category: unknown) =>
  FINANCIAL_ACCOUNTS.find(c => c.label === category)?.code ?? "EXP.UNMAPPED";
export const fingerprint = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
export function cents(value: unknown) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(n)) throw Error("invalid_financial_amount");
  return n;
}
export interface FinancialLine {
  id: string;
  sourceType: string;
  sourceId: string;
  accountingDate: string;
  branchId: string | null;
  accountCode: string;
  amountCents: number;
  revision: string;
  [key: string]: unknown;
}
function line(input: Omit<FinancialLine, "revision">): FinancialLine {
  return { ...input, revision: fingerprint(input) } as FinancialLine;
}
type Row = Record<string, any>;
const branch = (id: unknown) => id == null ? null : String(id);
const iso = (value: unknown) => value == null ? null : new Date(String(value)).toISOString();

export function buildFinancialLines(input: {
  orders: Row[]; expenses: Row[]; vouchers: Row[]; depreciation: Row[];
  recognitions: FinancialRecognition[]; feeRates: Row[];
}) {
  const transactions: FinancialLine[] = [];
  const exclusions: Record<string, unknown>[] = [];
  const feeGroups = new Map<string, { gross: number; bps: number; month: string; branchId: string | null; count: number }>();
  const rateMap = new Map(input.feeRates.map(r => [`${r.payment_method}|${r.qr_provider ?? ""}`, cents(r.mdr_bps)]));
  for (const r of input.orders) {
    const amount = cents(r.total_cents);
    if (["voided", "pending_payment"].includes(r.status)) {
      const record = {
        id: `order:${r.id}`, sourceType: "order", sourceId: String(r.id),
        accountingDate: r.accounting_date, branchId: branch(r.branch_id),
        amountCents: amount, status: r.status, excludedReason: r.status,
      };
      exclusions.push({ ...record, revision: fingerprint(record) });
      continue;
    }
    const gross = r.status === "refunded" && r.is_legacy ? 0 : amount;
    const refund = r.status === "refunded" ? amount : 0;
    const rateKey = `${r.payment_method}|${r.qr_provider ?? ""}`;
    const groupId = fingerprint([r.accounting_date.slice(0, 7), branch(r.branch_id), r.payment_method, r.qr_provider ?? null]);
    const group = feeGroups.get(groupId) ?? {
      gross: 0, bps: rateMap.get(rateKey) ?? 0, month: r.accounting_date.slice(0, 7),
      branchId: branch(r.branch_id), count: 0,
    };
    group.gross += gross; group.count++; feeGroups.set(groupId, group);
    transactions.push(line({
      id: `order:${r.id}`, sourceType: "order", sourceId: String(r.id),
      accountingDate: r.accounting_date, branchId: branch(r.branch_id),
      accountCode: "REV.POS", amountCents: gross - refund,
      grossCents: gross, refundCents: refund, refundedAt: iso(r.refunded_at),
      createdAt: iso(r.created_at), status: r.status, isLegacy: Boolean(r.is_legacy),
      feeGroupId: groupId, updatedAt: null,
    }));
  }
  // Match the P&L's monthly branch/payment-group rounding. Do not invent
  // per-order fee allocations; these are calculated group charges, not journals.
  for (const [id, g] of Array.from(feeGroups)) {
    const raw = g.gross * g.bps / 10000;
    const amount = Math.sign(raw) * Math.round(Math.abs(raw));
    transactions.push(line({
      id: `pos-mdr:${id}`, sourceType: "derived_pos_fee_group", sourceId: id,
      accountingDate: `${g.month}-01`, accountingDatePrecision: "month",
      branchId: g.branchId, accountCode: "OPEX.MDR", amountCents: amount,
      rateBps: g.bps, basisGrossCents: g.gross, sourceRecordCount: g.count,
      derivation: "ROUND(monthly branch/payment-method/provider gross × current fee rate)",
    }));
  }
  for (const r of input.recognitions) {
    for (const [code, value] of [["REV.SUBSCRIPTION", r.revenueCents], ["OPEX.MDR", r.mdrCents]] as const) {
      transactions.push(line({
        id: `${r.sourceType}:${r.sourceId}:${r.accountingDate}:${code}`,
        sourceType: r.sourceType, sourceId: r.sourceId, accountingDate: r.accountingDate,
        branchId: r.branchId, accountCode: code, amountCents: cents(value),
        derivation: "Existing P&L service-period recognition, not a posted journal",
        sourceAmountCents: r.sourceAmountCents, serviceStartAt: r.serviceStartAt,
        serviceEndAt: r.serviceEndAt, defaultServiceDays: r.serviceEndAt == null ? 30 : null,
        updatedAt: null,
      }));
    }
  }
  for (const r of input.expenses) {
    const id = `expense:${r.submission_id}:${fingerprint(r.allocation_key)}`;
    const excluded = !r.is_present ? "removed_from_source"
      : !r.is_eligible ? "source_not_eligible"
      : !r.in_period ? "accounting_date_missing_or_outside_period"
      : r.allocation_status === "excluded_mdr_duplicate" ? "excluded_mdr_duplicate"
      : isInformationalPnlExpense(r.source_category) ? "informational_advance_salary" : null;
    const base = {
      id, sourceType: "expense_allocation", sourceId: String(r.submission_id),
      accountingDate: r.expense_date, branchId: branch(r.branch_id),
      accountCode: r.allocation_status === "allocated" ? categoryCode(r.pnl_category) : "EXP.UNMAPPED",
      amountCents: cents(r.cents), allocationStatus: r.allocation_status,
      updatedAt: iso(r.updated_at), sourceUpdatedAt: iso(r.source_updated_at),
      subcategory: null,
    };
    if (excluded) exclusions.push({ ...base, revision: fingerprint(base), excludedReason: excluded });
    else transactions.push(line(base));
  }
  for (const r of input.vouchers) {
    const base = {
      id: `voucher:${r.id}`, sourceType: "voucher_sale", sourceId: String(r.id),
      accountingDate: r.sale_date, branchId: branch(r.branch_id),
      accountCode: "REV.VOUCHER", amountCents: cents(r.total_cents),
      createdAt: iso(r.created_at), updatedAt: null, status: r.status,
    };
    if (r.status === "active") transactions.push(line(base));
    else exclusions.push({ ...base, revision: fingerprint(base), excludedReason: "voided_voucher" });
  }
  for (const r of input.depreciation) transactions.push(line({
    id: `depreciation:${r.year}:${r.month}:${r.branch_id}`,
    sourceType: "monthly_depreciation_setting", sourceId: `${r.year}:${r.month}:${r.branch_id}`,
    accountingDate: `${r.year}-${String(r.month).padStart(2, "0")}-01`,
    accountingDatePrecision: "month", branchId: branch(r.branch_id),
    accountCode: "EXP.DEPRECIATION", amountCents: cents(r.cents),
    updatedAt: iso(r.updated_at), assetId: null,
  }));
  transactions.sort((a, b) => a.id.localeCompare(b.id));
  return { transactions, exclusions };
}

export function categoryTotals(lines: FinancialLine[], branchIds: Set<string>) {
  const groups = new Map<string, { month: string; branchId: string | null; scope: string; accountCode: string; amountCents: number }>();
  for (const l of lines) {
    const b = l.branchId != null && branchIds.has(l.branchId) ? l.branchId : null;
    const key = JSON.stringify([l.accountingDate.slice(0, 7), b, l.accountCode]);
    const group = groups.get(key) ?? {
      month: l.accountingDate.slice(0, 7), branchId: b,
      scope: b == null ? "central_or_noncanonical" : "branch", accountCode: l.accountCode, amountCents: 0,
    };
    group.amountCents += l.amountCents;
    if (!Number.isSafeInteger(group.amountCents)) throw Error("financial_amount_overflow");
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function reconcileFinancialLines(lines: FinancialLine[], report: {
  months: Array<{ monthKey: string; lines: Array<{key: string; cents: number}> }>;
  ytd: Record<string, number>;
}) {
  return [...report.months.map(m => ({ period: m.monthKey, values: Object.fromEntries(m.lines.map(l => [l.key, l.cents])) })),
    { period: "quarter", values: report.ytd }].flatMap(({ period, values }) =>
    FINANCIAL_ACCOUNTS.map(account => {
      const actual = lines.filter(l => l.accountCode === account.code &&
        (period === "quarter" || l.accountingDate.slice(0, 7) === period)).reduce((sum, l) => sum + l.amountCents, 0);
      const expected = cents(values[account.pnlKey]);
      const differenceCents = actual - expected;
      return {
        period, accountCode: account.code, detailCents: actual, reportCents: expected, differenceCents,
        status: differenceCents === 0 ? "matched" : "difference",
        reason: differenceCents === 0 ? null : "Detail does not reconcile to the existing P&L; owner review required. No adjustment was inserted.",
      };
    }));
}
