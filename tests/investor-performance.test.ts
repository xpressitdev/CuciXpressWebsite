import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  createInvestorFeed, investorPeriod, INVESTOR_PATH, registerInvestorPerformanceRoutes,
  type InvestorSourceReport,
} from "../server/investorPerformance";

const NOW = new Date("2026-10-05T20:00:00Z"); // 6 October in Brunei.
const values = {
  pos_net_revenue: 10000, recognized_subscription_revenue: 200,
  voucher_sales_revenue: 900, revenue: 11100, cost_of_services: 4000,
  gross_profit: 7100, operating_expense: 2000, unmapped_expenses: 0,
  ebitda: 5100, depreciation: 100, net_profit: 5000,
};
function fixture(): InvestorSourceReport {
  return {
    ytd: { ...values },
    months: [{ year: 2026, month: 9, lines: Object.entries(values).map(([key, cents]) => ({ key, cents })) }],
    branches: [{ id: 1, name: "Tungku" }],
    coverage: {
      status: "live", depreciationMissingMonths: [], warnings: [],
      ranges: { observed: { pos: { firstDate: "2026-09-01", lastDate: "2026-09-30" } } },
    },
    sync: { status: "succeeded", lastSuccessfulAt: "2026-10-05T19:59:00Z" },
  };
}
function appFor(reader = vi.fn(async () => fixture()), clock = () => NOW) {
  const app = express();
  registerInvestorPerformanceRoutes(app, reader, clock);
  return { app, reader };
}
describe("public investor performance", () => {
  it("defaults to the last completed Brunei quarter and permits explicit quarter-to-date requests", () => {
    expect(investorPeriod(undefined, undefined, NOW)).toMatchObject({
      label: "Q3 2026", startDate: "2026-07-01", endDate: "2026-09-30",
      quarterEndDate: "2026-09-30", status: "completed_period",
    });
    expect(investorPeriod(undefined, undefined, new Date("2027-01-01T00:00:00Z"))).toMatchObject({
      label: "Q4 2026", endDate: "2026-12-31", status: "completed_period",
    });
    expect(investorPeriod("2026", "4", NOW)).toMatchObject({
      label: "Q4 2026", startDate: "2026-10-01", endDate: "2026-10-06",
      quarterEndDate: "2026-12-31", status: "quarter_to_date",
    });
    expect(investorPeriod("2026", "4", new Date("2027-01-02T00:00:00Z"))).toMatchObject({
      endDate: "2026-12-31", status: "completed_period",
    });
  });
  it("rejects historic snapshots, future quarters and malformed or partial selectors", () => {
    for (const [year, quarter] of [["2026", "2"], ["2027", "1"], ["2026", "4x"],
      [["2026"], "4"], ["2026", undefined], [undefined, "4"]]) {
      expect(() => investorPeriod(year, quarter, NOW)).toThrow("invalid_period");
    }
  });
  it("returns only approved aggregate fields publicly and reconciles unallocated streams", async () => {
    const source = fixture();
    Object.assign(source, { customerEmail: "private@example.test", expenseRows: [{ employee: "private staff" }] });
    const reader = vi.fn(async (_year: number, branch: string) => branch === "overall" ? source : {
      ...fixture(), ytd: { ...values, revenue: 10000, ebitda: 4000 },
    });
    const { app } = appFor(reader);
    const res = await request(app).get(INVESTOR_PATH).expect(200);
    expect(res.body).toMatchObject({
      schemaVersion: 1, currency: "BND", amountUnit: "cents", access: "public",
      totals: { revenueCents: 11100, reportedProfitCents: 5000 },
      unallocated: { revenueCents: 1100, ebitdaCents: 1100 },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/private@example|private staff|expenseRows|"id"/);
    expect(reader).toHaveBeenCalledWith(2026, "overall", { startDate: "2026-07-01", endDate: "2026-09-30" });
  });
  it("supports CORS for the investor site without advertising credentials", async () => {
    const { app } = appFor();
    const res = await request(app).get(INVESTOR_PATH).set("Origin", "https://cucixpress-investors.replit.app").expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://cucixpress-investors.replit.app");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    const preflight = await request(app).options(INVESTOR_PATH).set("Origin", "https://cucixpress-investors.replit.app").expect(204);
    expect(preflight.headers["access-control-allow-methods"]).toBe("GET, OPTIONS");
    expect((await request(app).get(INVESTOR_PATH).set("Origin", "https://unrelated.example")).headers["access-control-allow-origin"]).toBeUndefined();
  });
  it("rejects arbitrary date, branch and cache-busting queries before reading the DB", async () => {
    const { app, reader } = appFor();
    for (const suffix of ["?year=2026", "?year=2026&quarter=2", "?branch_id=1", "?start_date=2026-10-01", "?t=1"]) {
      await request(app).get(INVESTOR_PATH + suffix).expect(400);
    }
    expect(reader).not.toHaveBeenCalled();
  });
  it("hides incomplete depreciation/profit rather than asserting a zero charge", async () => {
    const source = fixture();
    source.coverage.depreciationMissingMonths = ["2026-09"];
    const { app } = appFor(vi.fn(async () => source));
    const res = await request(app).get(INVESTOR_PATH).expect(200);
    expect(res.body.totals.depreciationCents).toBeNull();
    expect(res.body.totals.reportedProfitCents).toBeNull();
    expect(res.body.months[0].reportedProfitCents).toBeNull();
    expect(res.body.branches[0].reportedProfitCents).toBeNull();
    expect(res.body.dataQuality).toMatchObject({ provisional: true, warnings: ["depreciation_incomplete"] });
  });
  it("flags stale, unmapped and missing POS coverage, without exposing raw warnings", async () => {
    const source = fixture();
    source.coverage.status = "stale";
    source.ytd.unmapped_expenses = 123;
    source.coverage.ranges.observed.pos.firstDate = null;
    source.coverage.warnings = [{ code: "invalid_amount" }, { code: "excluded_advance_salary" }];
    const { app } = appFor(vi.fn(async () => source));
    const res = await request(app).get(INVESTOR_PATH).expect(200);
    expect(res.body.dataQuality.provisional).toBe(true);
    expect(res.body.dataQuality.warnings).toEqual(expect.arrayContaining([
      "source_requires_review", "unmapped_expenses", "accounting_review_required", "no_pos_records_in_period",
    ]));
    expect(JSON.stringify(res.body)).not.toContain("invalid_amount");
  });
  it("coalesces concurrent calls, caches five minutes and rolls over on Brunei day change", async () => {
    let now = NOW;
    const reader = vi.fn(async () => fixture());
    const feed = createInvestorFeed(reader, () => now);
    const period = investorPeriod("2026", "4", now);
    await Promise.all([feed(period), feed(period)]);
    expect(reader).toHaveBeenCalledTimes(2); // Overall + one branch, not twice each.
    await feed(period);
    expect(reader).toHaveBeenCalledTimes(2);
    now = new Date(NOW.getTime() + 300_001);
    await feed(period);
    expect(reader).toHaveBeenCalledTimes(4);
    now = new Date("2026-10-06T20:00:00Z");
    await feed(investorPeriod("2026", "4", now));
    expect(reader).toHaveBeenCalledTimes(6);
  });
  it("returns a sanitized retryable failure and briefly caches failures", async () => {
    const reader = vi.fn(async () => { throw Error("secret connection string"); });
    const { app } = appFor(reader);
    const res = await request(app).get(INVESTOR_PATH).expect(503);
    expect(res.body).toEqual({ error: "performance_temporarily_unavailable" });
    expect(res.headers["retry-after"]).toBe("30");
    await request(app).get(INVESTOR_PATH).expect(503);
    expect(reader).toHaveBeenCalledTimes(1);
  });
  it("rate limits visitors before expensive report reads", async () => {
    const { app, reader } = appFor();
    for (let i = 0; i < 60; i++) await request(app).get(INVESTOR_PATH).expect(200);
    await request(app).get(INVESTOR_PATH).expect(429);
    expect(reader).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid numerical data rather than serving fabricated totals", async () => {
    const source = fixture();
    source.ytd.revenue = NaN;
    const { app } = appFor(vi.fn(async () => source));
    await request(app).get(INVESTOR_PATH).expect(503);
  });
});
