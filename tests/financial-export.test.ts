import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerFinancialExportRoutes, FINANCIAL_EXPORT_PATH } from "../server/financialExportRoutes";
import { buildFinancialLines, categoryTotals, FINANCIAL_ACCOUNTS, reconcileFinancialLines } from "../server/financialExportModel";

// Synthetic test credential only; never use this outside tests.
const TEST_KEY = "unit-test-credential-only-0123456789";
const clock = () => new Date("2026-10-07T00:00:00Z");
const path = `${FINANCIAL_EXPORT_PATH}?year=2026&quarter=3`;
function setup(generate = vi.fn(async () => ({ exportId: "test" })), key: () => string | undefined = () => TEST_KEY) {
  const app = express();
  registerFinancialExportRoutes(app, generate, key, clock);
  return { app, generate };
}
describe("protected financial export route", () => {
  it("rejects anonymous, wrong, query-string and staff-cookie-only access before reading data", async () => {
    const { app, generate } = setup();
    await request(app).get(path).expect(401);
    await request(app).get(path).set("Authorization", "Bearer incorrect").expect(401);
    await request(app).get(path + "&api_key=" + TEST_KEY).expect(401);
    await request(app).get(path).set("Cookie", "staff_session=not-an-integration-key").expect(401);
    expect(generate).not.toHaveBeenCalled();
  });
  it("fails closed for missing/short key and supports immediate rotation", async () => {
    let key: string | undefined;
    const { app, generate } = setup(undefined, () => key);
    await request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`).expect(503);
    key = "short";
    await request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`).expect(503);
    key = TEST_KEY;
    await request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`).expect(200);
    key = TEST_KEY + "-rotated";
    await request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`).expect(401);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("exports exactly Q3, without public caching or browser CORS", async () => {
    const { app, generate } = setup();
    const response = await request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`)
      .set("Origin", "https://cucixpress-investors.replit.app").expect(200);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      startDate: "2026-07-01", endDate: "2026-09-30", status: "completed_period",
    }));
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    await request(app).post(path).set("Authorization", `Bearer ${TEST_KEY}`).expect(404);
  });
  it("rejects unfinished quarters, historical Q2, missing/duplicate/extra selectors", async () => {
    const { app, generate } = setup();
    for (const query of ["", "?year=2026&quarter=4", "?year=2026&quarter=2",
      "?year=2026&quarter=3&quarter=4", "?year=2026&quarter=3&branch_id=1"]) {
      await request(app).get(FINANCIAL_EXPORT_PATH + query).set("Authorization", `Bearer ${TEST_KEY}`).expect(400);
    }
    expect(generate).not.toHaveBeenCalled();
  });
  it("limits expensive exports and returns sanitized errors", async () => {
    const { app } = setup(vi.fn(async () => { throw Error("private SQL details"); }));
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`).expect(503);
      expect(res.body).toEqual({ error: "financial_export_unavailable" });
    }
    await request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`).expect(429);
  });
  it("rejects concurrent generation without starting a second export", async () => {
    let resolve!: () => void;
    const gate = new Promise<void>(r => { resolve = r; });
    let started!: () => void;
    const start = new Promise<void>(r => { started = r; });
    const generate = vi.fn(async () => { started(); await gate; return { exportId: "test" }; });
    const { app } = setup(generate);
    const first = request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`).then(r => r);
    await start;
    await request(app).get(path).set("Authorization", `Bearer ${TEST_KEY}`).expect(429);
    resolve();
    expect((await first).status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("financial export projection and reconciliation", () => {
  const order = { id: "sale-1", branch_id: 1, accounting_date: "2026-07-01", total_cents: 10000,
    status: "paid", payment_method: "card", qr_provider: null, created_at: "2026-07-01T01:00:00Z" };
  const expense = { submission_id: "expense-1", allocation_key: "branch:1", expense_date: "2026-07-02",
    in_period: true, is_present: true, is_eligible: true, source_category: "Water Bill", pnl_category: "Water Bill",
    allocation_status: "allocated", cents: 2000, branch_id: 1 };
  const empty = { orders: [], expenses: [], vouchers: [], depreciation: [], recognitions: [], feeRates: [] };
  it("projects only financial fields, separates gross/refunds and preserves revisions", () => {
    const input = { ...empty, orders: [{ ...order, plate: "PRIVATE", payment_ref: "PRIVATE",
      pocket_pay_success_indicator: "PRIVATE", customer_id: 555 }],
      expenses: [{ ...expense, employee_name: "PRIVATE" }],
      feeRates: [{ payment_method: "card", qr_provider: null, mdr_bps: 100 }] };
    const a = buildFinancialLines(input);
    expect(JSON.stringify(a)).not.toContain("PRIVATE");
    expect(a.transactions.find(l => l.id === "order:sale-1")).toMatchObject({
      amountCents: 10000, grossCents: 10000, refundCents: 0,
    });
    const revised = buildFinancialLines({ ...input, orders: [{ ...order, total_cents: 11000 }] });
    expect(revised.transactions.find(l => l.id === "order:sale-1")?.revision)
      .not.toBe(a.transactions.find(l => l.id === "order:sale-1")?.revision);
  });
  it("matches native and legacy refund accounting without inventing adjustments", () => {
    const { transactions } = buildFinancialLines({ ...empty,
      orders: [{ ...order, status: "refunded" }, { ...order, id: "legacy", status: "refunded", is_legacy: true }] });
    expect(transactions.find(l => l.id === "order:sale-1")?.amountCents).toBe(0);
    expect(transactions.find(l => l.id === "order:legacy")?.amountCents).toBe(-10000);
  });
  it("excludes pending/void orders, advance salary, duplicate MDR and removed/undated expenses", () => {
    const result = buildFinancialLines({ ...empty,
      orders: [{ ...order, status: "pending_payment" }, { ...order, id: "voided", status: "voided" }],
      expenses: [
        { ...expense, source_category: "Advance Salary" },
        { ...expense, allocation_status: "excluded_mdr_duplicate" },
        { ...expense, is_present: false },
        { ...expense, expense_date: null, in_period: false },
      ],
    });
    expect(result.transactions).toHaveLength(0);
    expect(result.exclusions).toHaveLength(6);
  });
  it("keeps unassigned categories and missing fee defaults explicit", () => {
    const { transactions } = buildFinancialLines({ ...empty, orders: [order],
      expenses: [{ ...expense, branch_id: null, allocation_status: "unmapped_category" }] });
    const totals = categoryTotals(transactions, new Set(["1"]));
    expect(totals).toContainEqual(expect.objectContaining({
      branchId: null, scope: "central_or_noncanonical", accountCode: "EXP.UNMAPPED", amountCents: 2000,
    }));
    expect(transactions.find(l => l.accountCode === "OPEX.MDR")?.amountCents).toBe(0);
  });
  it("recognizes active vouchers at sale, voids as exclusions, and configured zero depreciation", () => {
    const { transactions, exclusions } = buildFinancialLines({ ...empty,
      vouchers: [{ id: "v1", sale_date: "2026-07-01", total_cents: 999, status: "active" },
        { id: "v2", sale_date: "2026-07-01", total_cents: 999, status: "voided" }],
      depreciation: [{ year: 2026, month: 7, branch_id: 1, cents: 0 }],
    });
    expect(transactions.find(l => l.accountCode === "REV.VOUCHER")?.amountCents).toBe(999);
    expect(transactions.find(l => l.accountCode === "EXP.DEPRECIATION")?.amountCents).toBe(0);
    expect(exclusions[0].excludedReason).toBe("voided_voucher");
  });
  it("reports mismatches instead of manufacturing balancing entries", () => {
    const { transactions } = buildFinancialLines({ ...empty, orders: [order], expenses: [expense] });
    const ytd = Object.fromEntries(FINANCIAL_ACCOUNTS.map(a => [a.pnlKey, 0]));
    ytd.pos_net_revenue = 10000;
    ytd["expense:Water Bill"] = 2100;
    const checks = reconcileFinancialLines(transactions, {
      months: [{ monthKey: "2026-07", lines: Object.entries(ytd).map(([key, cents]) => ({ key, cents })) }], ytd,
    });
    expect(checks.find(c => c.accountCode === "REV.POS")?.status).toBe("matched");
    expect(checks.find(c => c.accountCode === "COS.WATER")).toMatchObject({ status: "difference", differenceCents: -100 });
    expect(transactions.some(l => l.sourceType === "balancing_adjustment")).toBe(false);
  });
});
