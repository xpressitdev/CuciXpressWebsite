import type { Express } from "express";

// This explicit projection is the PUBLIC disclosure boundary. Never return
// source reports, individual orders, users, expenses or arbitrary DB rows.
export interface InvestorSourceReport {
  ytd: Record<string, number>;
  months: Array<{ year?: number; month: number; lines: Array<{ key: string; cents: number }> }>;
  branches: Array<Record<string, unknown>>;
  coverage: {
    status: string;
    depreciationMissingMonths: string[];
    warnings: Array<{ code: string }>;
    ranges: { observed: Record<string, { firstDate: string | null; lastDate: string | null }> };
  };
  sync: { status: string; lastSuccessfulAt?: unknown };
}
type ReportReader = (year: number, branch: string, range: { startDate: string; endDate: string }) => Promise<InvestorSourceReport>;
export const INVESTOR_PATH = "/api/public/investor-performance";
const TTL_MS = 5 * 60_000;
const INVESTOR_ORIGIN = "https://cucixpress-investors.replit.app";
const POLICY = [
  "Unaudited management accounts; amounts are integer BND cents.",
  "Revenue is POS net of refunds plus recognised subscriptions and paid voucher sales.",
  "Paid physical vouchers are recognised in full at sale under management policy; redemption adds no revenue.",
  "Subscription revenue is recognised over service periods.",
  "Reported profit is EBITDA less configured depreciation; financing and income tax are not separately modelled.",
  "Depreciation is prorated through the reporting cutoff. Advance salary is informational, not a P&L expense.",
  "Previously published quarters remain separate snapshots; this feed begins with Q4 2026.",
];

export function investorPeriod(rawYear: unknown, rawQuarter: unknown, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Brunei", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const currentYear = Number(today.slice(0, 4));
  const currentQuarter = Math.ceil(Number(today.slice(5, 7)) / 3);
  if ((rawYear === undefined) !== (rawQuarter === undefined)) throw Error("invalid_period");
  const year = rawYear === undefined ? currentYear : typeof rawYear === "string" && /^\d{4}$/.test(rawYear) ? Number(rawYear) : NaN;
  const quarter = rawQuarter === undefined ? currentQuarter : typeof rawQuarter === "string" && /^[1-4]$/.test(rawQuarter) ? Number(rawQuarter) : NaN;
  if (!Number.isInteger(year) || !Number.isInteger(quarter) ||
      year < 2026 || (year === 2026 && quarter < 4) ||
      year > currentYear || (year === currentYear && quarter > currentQuarter)) throw Error("invalid_period");
  const startMonth = (quarter - 1) * 3 + 1;
  const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const quarterEndDate = new Date(Date.UTC(year, startMonth + 2, 0)).toISOString().slice(0, 10);
  return {
    year, quarter, label: `Q${quarter} ${year}`, startDate, quarterEndDate,
    endDate: today < quarterEndDate ? today : quarterEndDate,
    status: today <= quarterEndDate ? "quarter_to_date" : "completed_period",
    timezone: "Asia/Brunei",
  };
}

function metrics(values: Record<string, number>, missingDepreciation: boolean) {
  const amount = (key: string) => {
    const value = values[key];
    if (!Number.isSafeInteger(value)) throw Error("invalid_reporting_amount");
    return value;
  };
  const revenue = amount("revenue");
  const profit = missingDepreciation ? null : amount("net_profit");
  return {
    revenueCents: revenue,
    posNetRevenueCents: amount("pos_net_revenue"),
    subscriptionRevenueCents: amount("recognized_subscription_revenue"),
    voucherRevenueCents: amount("voucher_sales_revenue"),
    costOfServicesCents: amount("cost_of_services"),
    grossProfitCents: amount("gross_profit"),
    operatingExpensesCents: amount("operating_expense"),
    unmappedExpensesCents: amount("unmapped_expenses"),
    ebitdaCents: amount("ebitda"),
    depreciationCents: missingDepreciation ? null : amount("depreciation"),
    reportedProfitCents: profit,
    reportedProfitMarginPercent: profit === null || revenue === 0 ? null : Math.round(profit / revenue * 10_000) / 100,
  };
}

function quality(report: InvestorSourceReport) {
  const warnings = new Set<string>();
  if (report.coverage.depreciationMissingMonths.length) warnings.add("depreciation_incomplete");
  if (report.coverage.status !== "live") warnings.add("source_requires_review");
  if (report.ytd.unmapped_expenses !== 0) warnings.add("unmapped_expenses");
  if (report.coverage.warnings.some(w => !["excluded_advance_salary", "excluded_status", "excluded_mdr_duplicate"].includes(w.code))) {
    warnings.add("accounting_review_required");
  }
  if (!report.coverage.ranges.observed.pos?.firstDate) warnings.add("no_pos_records_in_period");
  return {
    status: report.coverage.status,
    provisional: warnings.size > 0,
    warnings: Array.from(warnings),
    depreciationComplete: !report.coverage.depreciationMissingMonths.length,
  };
}

export function createInvestorFeed(read: ReportReader, clock = () => new Date()) {
  const cache = new Map<string, { payload: unknown; expires: number }>();
  const pending = new Map<string, Promise<unknown>>();
  const failedUntil = new Map<string, number>();
  return async (period: ReturnType<typeof investorPeriod>) => {
    const key = `${period.startDate}:${period.endDate}:${period.status}`;
    const time = clock().getTime();
    const hit = cache.get(key);
    if (hit && hit.expires > time) return hit.payload;
    if ((failedUntil.get(key) ?? 0) > time) throw Error("temporarily_unavailable");
    if (pending.has(key)) return pending.get(key)!;
    const work = (async () => {
      try {
        const range = { startDate: period.startDate, endDate: period.endDate };
        const overall = await read(period.year, "overall", range);
        const branchReports = [];
        // Limit DB fanout; per-period single-flight also coalesces concurrent visitors.
        for (const branch of overall.branches) {
          const report = await read(period.year, String(branch.id), range);
          branchReports.push({ name: String(branch.name), ...metrics(report.ytd,
            report.coverage.depreciationMissingMonths.length > 0), dataQuality: quality(report) });
        }
        const total = metrics(overall.ytd, overall.coverage.depreciationMissingMonths.length > 0);
        const lastSuccess = overall.sync.lastSuccessfulAt;
        const parsedSync = lastSuccess == null ? NaN : new Date(String(lastSuccess)).getTime();
        const generatedAt = clock().toISOString();
        const payload = {
          schemaVersion: 1, currency: "BND", amountUnit: "cents", access: "public",
          period, generatedAt, refreshAfterSeconds: 300,
          latestSuccessfulExpenseSyncAt: Number.isFinite(parsedSync) ? new Date(parsedSync).toISOString() : null,
          dataQuality: quality(overall), totals: total,
          months: overall.months.map(m => ({
            month: `${m.year ?? period.year}-${String(m.month).padStart(2, "0")}`,
            ...metrics(Object.fromEntries(m.lines.map(l => [l.key, l.cents])),
              overall.coverage.depreciationMissingMonths.includes(`${m.year ?? period.year}-${String(m.month).padStart(2, "0")}`)),
          })),
          branches: branchReports,
          unallocated: {
            revenueCents: total.revenueCents - branchReports.reduce((n, b) => n + b.revenueCents, 0),
            ebitdaCents: total.ebitdaCents - branchReports.reduce((n, b) => n + b.ebitdaCents, 0),
            note: "Central/unassigned streams are not arbitrarily allocated to branches.",
          },
          reportingPolicies: POLICY,
        };
        // Bounded process-local cache; failures never masquerade as zero financials.
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, { payload, expires: clock().getTime() + TTL_MS });
        failedUntil.delete(key);
        return payload;
      } catch {
        if (failedUntil.size >= 64) failedUntil.clear();
        failedUntil.set(key, clock().getTime() + 30_000);
        throw Error("temporarily_unavailable");
      }
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
}

export function registerInvestorPerformanceRoutes(app: Express, read: ReportReader, clock = () => new Date()) {
  const feed = createInvestorFeed(read, clock);
  const clients = new Map<string, { count: number; until: number }>();
  app.options(INVESTOR_PATH, (req, res) => {
    res.vary("Origin");
    if (req.get("Origin")?.toLowerCase() === INVESTOR_ORIGIN) {
      res.set("Access-Control-Allow-Origin", INVESTOR_ORIGIN);
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    }
    res.sendStatus(204);
  });
  app.get(INVESTOR_PATH, async (req, res) => {
    res.vary("Origin");
    if (req.get("Origin")?.toLowerCase() === INVESTOR_ORIGIN) res.set("Access-Control-Allow-Origin", INVESTOR_ORIGIN);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store");
    const time = clock().getTime(), ip = req.ip ?? "unknown";
    const existing = clients.get(ip);
    const entry = existing && existing.until > time ? existing : { count: 0, until: time + 60_000 };
    if (clients.size >= 5000 && !clients.has(ip)) {
      for (const [key, value] of Array.from(clients)) if (value.until <= time) clients.delete(key);
      if (clients.size >= 5000) return res.status(429).set("Retry-After", "60").json({ error: "rate_limited" });
    }
    clients.set(ip, entry);
    if (++entry.count > 60) return res.status(429).set("Retry-After", "60").json({ error: "rate_limited" });
    let period;
    try {
      if (Object.keys(req.query).some(k => !["year", "quarter"].includes(k))) throw Error("invalid_period");
      period = investorPeriod(req.query.year, req.query.quarter, clock());
    } catch {
      return res.status(400).json({ error: "invalid_period", message: "Use year and quarter together. Only started quarters from Q4 2026 onward are supported." });
    }
    try {
      const payload = await feed(period);
      res.set("Cache-Control", "public, max-age=60");
      return res.json(payload);
    } catch {
      return res.status(503).set("Retry-After", "30").json({ error: "performance_temporarily_unavailable" });
    }
  });
}
