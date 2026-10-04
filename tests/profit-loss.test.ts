import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  allocateConnecteamExpense,
  buildPnl,
  mapPnlExpenseCategory,
  isInformationalPnlExpense,
  inferRecurringExpenseReminders,
  PNL_BRANCH_NAMES,
  splitCentsExactly,
  type PnlAllocationTarget,
} from "../shared/profitLoss";
import {
  bruneiYmd,
  buildYtdFromMonths,
  connecteamSyncFailureResponse,
  connecteamSyncInProgressResponse,
  createConnecteamSyncHandler,
  deriveCoverageStatus,
  fetchAllConnecteamSubmissions,
  getProfitLossReport,
  grossSalesCents,
  mdrFeeForGroup,
  normalizeProfitLossDateRange,
  planConnecteamExpenseAllocations,
  recognizeRevenueByBruneiDay,
  registerProfitLossRoutes,
  sanitizeConnecteamSubmission,
  validateConnecteamSnapshot,
} from "../server/profitLossService";

const branches: PnlAllocationTarget[] = PNL_BRANCH_NAMES.map((name, index) => ({
  id: String(index + 1),
  name,
}));

const line = (month: ReturnType<typeof buildPnl>[number], key: string) =>
  month.lines.find((entry) => entry.key === key)?.cents;

const queryText = (query: unknown) => {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return chunks.map((chunk: any) => {
    if (typeof chunk === "string") return chunk;
    if (Array.isArray(chunk?.value)) return chunk.value.join("");
    if (Array.isArray(chunk?.queryChunks)) return queryText(chunk);
    return "";
  }).join("");
};

/**
 * The custom report is deliberately exercised through the backend service,
 * while the database boundary is supplied with deterministic read-only rows.
 * This keeps date-boundary assertions independent of staging data and still
 * lets the service's recognition, depreciation, YTD, and response contract run.
 */
function mockCustomReportReads(options?: {
  expenses?: any[];
  depreciation?: any[];
  invoices?: any[];
  counter?: any[];
  fees?: any[];
  branches?: any[];
}) {
  const queries: string[] = [];
  const branchesForFixture = options?.branches ?? branches.map((branch) => ({
    id: branch.id, name: branch.name,
  }));
  const execute = vi.spyOn(db, "execute").mockImplementation(((query: unknown) => {
    const text = queryText(query);
    queries.push(text);
    let rows: any[] = [];
    if (text.includes("SELECT extract(year FROM s.expense_date)")) {
      rows = (options?.expenses ?? []).map((row) => ({
        year: row.year ?? 2026, month: row.month ?? 1, branch_id: row.branch_id ?? "1",
        pnl_category: row.pnl_category ?? "Water Bill",
        allocation_status: row.allocation_status ?? "allocated", cents: row.cents ?? 0,
      }));
    } else if (text.includes("SELECT a.allocation_status")) {
      rows = [];
    } else if (text.includes("SELECT year, month, branch_id")) {
      rows = options?.depreciation ?? [];
    } else if (text.includes("SELECT b.id::text AS id")) {
      rows = branchesForFixture;
    } else if (text.includes("SELECT last_successful_at")) {
      rows = [];
    } else if (text.includes("SELECT extract(year FROM date(")) {
      rows = [];
    } else if (text.includes("SELECT id, branch_id::text AS branch_id, vehicle_id")) {
      rows = options?.counter ?? [];
    } else if (text.includes("SELECT i.id, i.amount_cents")) {
      rows = options?.invoices ?? [];
    } else if (text.includes("SELECT s.id, s.price_cents")) {
      rows = [];
    } else if (text.includes("SELECT payment_method, qr_provider, mdr_bps")) {
      rows = options?.fees ?? [];
    } else if (text.includes("SELECT 'expenses' AS source")) {
      rows = [
        { source: "expenses", first_date: null, last_date: null },
        { source: "pos", first_date: null, last_date: null },
        { source: "subscription_invoices", first_date: null, last_date: null },
      ];
    } else if (text.includes("SELECT s.expense_date::text AS expense_date")) {
      rows = [];
    }
    return Promise.resolve({ rows } as any);
  }) as any);
  return { execute, queries };
}

describe("P&L accounting contract", () => {
  it("suggests the first absent month after a two-month recurring pattern", () => {
    const observations = [
      { expenseDate: "2024-07-01", sourceCategory: "Management Fee", branchId: "1", eligible: true },
      { expenseDate: "2024-08-01", sourceCategory: "Management Fee", branchId: "1", eligible: true },
      // A valid zero-value capture still counts as captured.
      { expenseDate: "2024-08-15", sourceCategory: "Management Fee", branchId: "1", eligible: true },
    ];
    const reminders = inferRecurringExpenseReminders({
      observations, reportYear: 2024, currentBruneiYmd: "2024-09-13",
      branchNames: { "1": "Tungku" },
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      category: "Management Fee", sourceCategory: "Management Fee",
      branchId: "1", branchName: "Tungku", year: 2024, month: 9,
      period: "current", status: "missing", evidenceMonths: ["2024-07", "2024-08"],
    });
    expect(reminders.some((reminder) => reminder.month === 7 || reminder.month === 8)).toBe(false);
  });

  it("does not promote one-offs, invalid dates, or invalid branches into recurrence", () => {
    const reminders = inferRecurringExpenseReminders({
      observations: [
        { expenseDate: "2024-07-01", sourceCategory: "Foods & Drink", branchId: "1", eligible: true },
        { expenseDate: "2024-08-01", sourceCategory: "Maintenance & Repair", branchId: "1", eligible: true },
        // Even an eligible row cannot establish a pattern when its allocation
        // is explicitly invalid.
        { expenseDate: "2024-07-01", sourceCategory: "Management Fee", branchId: "1", eligible: true, allocationStatus: "invalid_amount" },
        { expenseDate: "2024-08-01", sourceCategory: "Management Fee", branchId: "1", eligible: true, allocationStatus: "allocated" },
        { expenseDate: null, sourceCategory: "Management Fee", branchId: "1", eligible: true },
        { expenseDate: "2024-07-01", sourceCategory: "Management Fee", branchId: null, eligible: true },
      ],
      reportYear: 2024, currentBruneiYmd: "2024-09-13",
    });
    expect(reminders).toEqual([]);
  });

  it("keeps pending and rejected submissions distinct from a truly absent month", () => {
    const reminders = inferRecurringExpenseReminders({
      observations: [
        { expenseDate: "2024-07-01", sourceCategory: "Management Fee", branchId: "1", eligible: true },
        { expenseDate: "2024-08-01", sourceCategory: "Management Fee", branchId: "1", eligible: true },
        { expenseDate: "2024-09-01", sourceCategory: "Management Fee", branchId: "1", eligible: false, sourceStatus: "Pending" },
        { expenseDate: "2024-10-01", sourceCategory: "Management Fee", branchId: "1", eligible: false, sourceStatus: "Rejected" },
      ],
      reportYear: 2024, currentBruneiYmd: "2024-10-13",
    });
    expect(reminders).toEqual(expect.arrayContaining([
      expect.objectContaining({ month: 9, status: "pending", period: "completed" }),
      expect.objectContaining({ month: 10, status: "rejected", period: "current" }),
    ]));
    expect(reminders).toHaveLength(2);
  });

  it("uses prior-year evidence and keeps Overall allocations branch-specific", () => {
    const reminders = inferRecurringExpenseReminders({
      observations: [
        { expenseDate: "2023-11-01", sourceCategory: "Management Fee", branchId: "1", eligible: true },
        { expenseDate: "2023-12-01", sourceCategory: "Management Fee", branchId: "1", eligible: true },
        { expenseDate: "2023-11-01", sourceCategory: "Management Fee", branchId: "2", eligible: true },
        // Branch 2 has only one preceding capture and must not inherit branch 1's pattern.
      ],
      reportYear: 2024, currentBruneiYmd: "2024-01-13",
      branchNames: { "1": "Tungku", "2": "Salar" },
    });
    expect(reminders).toEqual([
      expect.objectContaining({
        month: 1, year: 2024, branchId: "1", branchName: "Tungku",
        evidenceMonths: ["2023-11", "2023-12"],
      }),
    ]);
  });

  it("splits an All expense exactly once with cent conservation", () => {
    const allocations = allocateConnecteamExpense(101, ["All", "Tungku", "Tungku"], branches);
    expect(allocations).toEqual([
      { branchId: "1", cents: 21 },
      { branchId: "2", cents: 20 },
      { branchId: "3", cents: 20 },
      { branchId: "4", cents: 20 },
      { branchId: "5", cents: 20 },
    ]);
    expect(allocations.reduce((total, entry) => total + entry.cents, 0)).toBe(101);
    expect(splitCentsExactly(-101, branches).reduce((total, entry) => total + entry.cents, 0)).toBe(-101);
    expect(allocateConnecteamExpense(1, ["Tungku Branch"], branches)).toEqual([{ branchId: "1", cents: 1 }]);
  });

  it("deduplicates selected branches and leaves invalid choices unallocated", () => {
    expect(allocateConnecteamExpense(101, ["Tungku", "Tungku", "Salar"], branches))
      .toEqual([{ branchId: "1", cents: 51 }, { branchId: "2", cents: 50 }]);
    expect(allocateConnecteamExpense(101, ["Unknown branch"], branches)).toEqual([]);
  });

  it("maps workbook categories but requires review for unknown values", () => {
    expect(mapPnlExpenseCategory("  wifi / internet ")).toBe("Wifi Internet");
    expect(mapPnlExpenseCategory("mystery reimbursement")).toBeUndefined();
    expect(mapPnlExpenseCategory(null)).toBeUndefined();
  });

  it("keeps MDR separate and never duplicates unallocated online revenue into branches", () => {
    const data = {
      revenue: [
        { month: 1, branchId: "1", posNetRevenueCents: 10_000, subscriptionRecognizedGrossCents: 0, mdrCents: 200 },
        { month: 1, branchId: null, posNetRevenueCents: 0, subscriptionRecognizedGrossCents: 3_000, mdrCents: 60 },
      ],
      expenses: [
        { month: 1, branchId: "1", category: "Water Bill" as const, cents: 1_000 },
        { month: 1, branchId: "1", unmappedReason: "unrecognised source category", cents: 30 },
      ],
      depreciation: [{ month: 1, branchId: "1", cents: 142 }],
    };

    const branch = buildPnl({ branchId: "1", ...data })[0];
    expect(line(branch, "revenue")).toBe(10_000);
    expect(line(branch, "merchant_discount_rate")).toBe(200);
    expect(line(branch, "operating_expense")).toBe(200);
    expect(line(branch, "unmapped_expenses")).toBe(30);
    expect(line(branch, "ebitda")).toBe(8_770);
    expect(line(branch, "net_profit")).toBe(8_628);
    expect(branch.depreciationConfigured).toBe(true);

    const overall = buildPnl({ branchId: "overall", ...data })[0];
    expect(line(overall, "revenue")).toBe(13_000);
    expect(line(overall, "merchant_discount_rate")).toBe(260);
    expect(line(overall, "net_profit")).toBe(11_568);
    expect(overall.depreciationConfigured).toBe(false);
    const completeOverall = buildPnl({
      branchId: "overall", overallBranchIds: branches.map((branch) => branch.id),
      revenue: [], expenses: [],
      depreciation: branches.map((branch) => ({ month: 1, branchId: branch.id, cents: 142 })),
    })[0];
    expect(completeOverall.depreciationConfigured).toBe(true);
  });

  it("projects only approved/no-status Connecteam accounting answers", () => {
    const base = {
      formSubmissionId: "submission-1",
      submissionTimestamp: 1_786_000_000,
      answers: [
        { questionId: "e8fb454f-fce3-5925-b55d-56de962721de", selectedAnswers: [{ text: "All" }] },
        { questionId: "ea53efbb-36f2-b8f3-15e9-b8e579becd84", timestamp: 1_786_000_000 },
        { questionId: "e1952c17-91ee-e2da-5e88-090f05658828", selectedAnswers: [{ text: "Water Bill" }] },
        { questionId: "5ddac283-6e65-77aa-40f1-93661b0b17b8", inputValue: 10.01 },
        // A receipt/account-number/open-ended answer would be ignored because
        // it is not one of the four approved accounting question ids.
        { questionId: "sensitive-field", value: "do not retain" },
      ],
      managerFields: [],
    };
    const noStatus = sanitizeConnecteamSubmission(base);
    expect(noStatus).toMatchObject({
      expenseDate: "2026-08-06", amountCents: 1001, sourceCategory: "Water Bill",
      branchChoices: ["All"], eligible: true,
    });
    const rejected = sanitizeConnecteamSubmission({
      ...base,
      managerFields: [{ managerFieldId: "65e3093e4aadfdbd0eeb96aa", status: { name: "Reject" } }],
    });
    expect(rejected?.eligible).toBe(false);
  });

  it("keeps every P&L endpoint owner-only before any accounting query runs", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.staff = { user: { id: "manager-fixture", role: "manager" } as any, session: {} as any };
      next();
    });
    registerProfitLossRoutes(app);
    await request(app).get("/api/admin/profit-loss?year=2026").expect(403);
    await request(app).post("/api/admin/profit-loss/sync").expect(403);
    await request(app).put("/api/admin/profit-loss/depreciation").send({
      year: 2026, month: 1, branch_id: 1, cents: 14167,
    }).expect(403);
  });

  it("returns a running 202 for an active distributed sync, not a failure or completion", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.staff = { user: { id: "owner-fixture", role: "owner" } as any, session: {} as any };
      next();
    });
    app.post("/api/admin/profit-loss/sync", createConnecteamSyncHandler(async () => {
      throw new Error("connecteam_sync_in_progress");
    }));

    const response = await request(app).post("/api/admin/profit-loss/sync").expect(202);
    expect(response.body).toMatchObject({
      status: "running",
      message: expect.stringContaining("already in progress"),
      pollAfterSeconds: 5,
    });
    expect(response.body.error).toBeUndefined();
    expect(response.body.submissionsSeen).toBeUndefined();
    expect(connecteamSyncInProgressResponse().status).toBe("running");
  });

  it("returns a whitelisted actionable error for a real sync failure without raw details", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.staff = { user: { id: "owner-fixture", role: "owner" } as any, session: {} as any };
      next();
    });
    app.post("/api/admin/profit-loss/sync", createConnecteamSyncHandler(async () => {
      throw new Error("connecteam_fetch_timeout");
    }));

    const response = await request(app).post("/api/admin/profit-loss/sync").expect(502);
    expect(response.body).toMatchObject({
      status: "failed",
      error: "connecteam_fetch_timeout",
      message: expect.stringContaining("did not respond"),
    });
    expect(response.body.message).not.toContain("API");
    expect(connecteamSyncFailureResponse(new Error("secret-upstream-payload"))).toMatchObject({
      status: "failed",
      error: "connecteam_sync_failed",
    });
  });

  it("returns completed only when the sync executor reports a persisted success", async () => {
    const app = express();
    app.post("/api/admin/profit-loss/sync", createConnecteamSyncHandler(async () => ({
      status: "succeeded",
      submissionsSeen: 4,
      eligible: 3,
    })));

    const response = await request(app).post("/api/admin/profit-loss/sync").expect(200);
    expect(response.body).toEqual({
      status: "succeeded",
      submissionsSeen: 4,
      eligible: 3,
    });
    expect(response.body.message).toBeUndefined();
  });

  it("recognizes each paid invoice by its actual Brunei-local period, including renewals", () => {
    const juneInvoice = recognizeRevenueByBruneiDay({
      amountCents: 3_100, mdrCents: 78,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-01T00:00:00.000Z"),
      branchId: null,
    })!;
    const renewal = recognizeRevenueByBruneiDay({
      amountCents: 3_100, mdrCents: 78,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-08-01T00:00:00.000Z"),
      branchId: null,
    })!;
    expect(juneInvoice).toHaveLength(30);
    expect(juneInvoice.reduce((total, row) => total + row.subscriptionRecognizedGrossCents, 0)).toBe(3_100);
    expect(juneInvoice.reduce((total, row) => total + row.mdrCents, 0)).toBe(78);
    expect(juneInvoice.reduce((total, row) =>
      total + row.subscriptionRecognizedGrossCents - row.mdrCents, 0)).toBe(3_022);
    expect(renewal.reduce((total, row) => total + row.subscriptionRecognizedGrossCents, 0)).toBe(3_100);
    expect(bruneiYmd(new Date("2026-12-31T16:00:00.000Z"))).toBe("2027-01-01");
    expect(recognizeRevenueByBruneiDay({
      amountCents: 100, mdrCents: 0, startsAt: new Date("2026-07-01T00:00:00Z"),
      endsAt: new Date("2026-07-01T00:00:00Z"), branchId: null,
    })).toBeNull();
  });

  it("validates paired inclusive custom dates and rejects reversed or oversized periods", async () => {
    expect(normalizeProfitLossDateRange("2026-02-28", "2026-02-29")).toBeNull();
    expect(normalizeProfitLossDateRange("2026-01-10", undefined)).toBeNull();
    expect(normalizeProfitLossDateRange("2026-01-11", "2026-01-10")).toBeNull();
    expect(normalizeProfitLossDateRange("2020-01-01", "2026-01-01")).toBeNull();
    expect(normalizeProfitLossDateRange("2026-01-10", "2026-01-10")).toMatchObject({
      startDate: "2026-01-10", endDate: "2026-01-10",
    });

    const app = express();
    app.use((req, _res, next) => {
      req.staff = { user: { id: "owner-fixture", role: "owner" } as any, session: {} as any };
      next();
    });
    registerProfitLossRoutes(app);
    await request(app).get("/api/admin/profit-loss?start_date=2026-01-10").expect(400);
    await request(app).get("/api/admin/profit-loss?start_date=2026-01-11&end_date=2026-01-10").expect(400);
  });

  it("filters partial invoice recognition by Brunei day and prorates depreciation by selected days", async () => {
    const invoice = {
      id: "invoice-partial",
      amount_cents: 3_100,
      period_start: "2026-01-01T00:00:00.000Z",
      period_end: "2026-02-01T00:00:00.000Z",
      payment_provider: "card",
    };
    const recognized = recognizeRevenueByBruneiDay({
      amountCents: invoice.amount_cents,
      mdrCents: mdrFeeForGroup(250, invoice.amount_cents),
      startsAt: new Date(invoice.period_start),
      endsAt: new Date(invoice.period_end),
      branchId: null,
    })!;
    const selectedDaily = recognized.slice(9, 19); // Jan 10 through Jan 19, inclusive.
    const fixture = mockCustomReportReads({
      invoices: [invoice],
      fees: [{ payment_method: "card", qr_provider: null, mdr_bps: 250 }],
      expenses: [{ year: 2026, month: 1, cents: 101 }],
      depreciation: [{ year: 2026, month: 1, branch_id: "1", cents: 3_100 }],
    });
    try {
      const report = await getProfitLossReport(2026, "overall", {
        startDate: "2026-01-10", endDate: "2026-01-19",
      });
      expect(report.dateRange).toEqual({ startDate: "2026-01-10", endDate: "2026-01-19" });
      expect(report.totalLabel).toBe("Period total");
      expect(report.months).toHaveLength(1);
      expect(report.months[0]).toMatchObject({ year: 2026, month: 1, monthKey: "2026-01" });
      expect(line(report.months[0], "recognized_subscription_revenue")).toBe(
        selectedDaily.reduce((sum, entry) => sum + entry.subscriptionRecognizedGrossCents, 0),
      );
      expect(line(report.months[0], "merchant_discount_rate")).toBe(
        selectedDaily.reduce((sum, entry) => sum + entry.mdrCents, 0),
      );
      expect(line(report.months[0], "depreciation")).toBe(1_000); // round(3100 * 10 / 31)
      expect(report.ytd.revenue).toBe(line(report.months[0], "revenue"));
      expect(report.ytd.profit_margin_bps).toBe(
        Math.round((report.ytd.net_profit * 10_000) / report.ytd.revenue),
      );
      const expenseQuery = fixture.queries.find((query) =>
        query.includes("SELECT extract(year FROM s.expense_date)"));
      expect(expenseQuery).toContain("2026-01-10");
      expect(expenseQuery).toContain("2026-01-20"); // exclusive upper bound
      const posQuery = fixture.queries.find((query) =>
        query.includes("SELECT extract(year FROM date("));
      expect(posQuery).toContain("WHEN o.status = 'refunded' AND o.legacy_source IS NOT NULL THEN 0");
      expect(posQuery).toContain("WHEN o.status = 'refunded' THEN o.total_cents");
      expect(posQuery).toContain("ROUND(");
      expect(selectedDaily.reduce(
        (sum, entry) => sum + entry.subscriptionRecognizedGrossCents - entry.mdrCents, 0,
      )).toBe(report.ytd.revenue - report.ytd.merchant_discount_rate);
      expect(report.coverage.note).toContain("prorates configured monthly depreciation");
    } finally {
      fixture.execute.mockRestore();
    }
  });

  it("keeps same-month custom buckets distinct across calendar years", async () => {
    const fixture = mockCustomReportReads({
      invoices: [
        {
          id: "december", amount_cents: 1_200,
          period_start: "2025-12-31T00:00:00.000Z",
          period_end: "2026-01-01T00:00:00.000Z", payment_provider: "card",
        },
        {
          id: "january", amount_cents: 2_000,
          period_start: "2026-01-01T00:00:00.000Z",
          period_end: "2026-01-02T00:00:00.000Z", payment_provider: "card",
        },
      ],
      fees: [{ payment_method: "card", qr_provider: null, mdr_bps: 0 }],
      expenses: [
        { year: 2025, month: 12, cents: 12 },
        { year: 2026, month: 1, cents: 34 },
      ],
      depreciation: [
        { year: 2025, month: 12, branch_id: "1", cents: 120 },
        { year: 2026, month: 1, branch_id: "1", cents: 340 },
      ],
    });
    try {
      const report = await getProfitLossReport(2026, "overall", {
        startDate: "2025-12-31", endDate: "2026-01-01",
      });
      expect(report.months.map((month) => month.monthKey)).toEqual(["2025-12", "2026-01"]);
      expect(report.months.map((month) => month.year)).toEqual([2025, 2026]);
      expect(line(report.months[0], "recognized_subscription_revenue")).toBe(1_200);
      expect(line(report.months[1], "recognized_subscription_revenue")).toBe(2_000);
      expect(line(report.months[0], "depreciation")).toBe(4);
      expect(line(report.months[1], "depreciation")).toBe(11);
      expect(report.ytd.revenue).toBe(3_200);
      expect(report.ytd.net_profit).toBe(3_200 - 12 - 34 - 4 - 11);
    } finally {
      fixture.execute.mockRestore();
    }
  });

  it("keeps early counter renewals out of their own sale month until prior recognition ends", async () => {
    const fixture = mockCustomReportReads({
      counter: [
        {
          id: "counter-first", branch_id: "1", vehicle_id: "vehicle-1",
          total_cents: 3_000, payment_method: "cash", qr_provider: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "counter-early-renewal", branch_id: "1", vehicle_id: "vehicle-1",
          total_cents: 7_000, payment_method: "cash", qr_provider: null,
          created_at: "2026-01-10T00:00:00.000Z",
        },
      ],
      fees: [],
    });
    try {
      const report = await getProfitLossReport(2026, "overall", {
        startDate: "2026-01-10", endDate: "2026-01-20",
      });
      const firstRecognition = recognizeRevenueByBruneiDay({
        amountCents: 3_000, mdrCents: 0,
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        branchId: "1",
      })!;
      const expected = firstRecognition.slice(9, 20)
        .reduce((sum, entry) => sum + entry.subscriptionRecognizedGrossCents, 0);
      expect(line(report.months[0], "recognized_subscription_revenue")).toBe(expected);
      expect(report.coverage.note).toContain("custom period");
    } finally {
      fixture.execute.mockRestore();
    }
  });

  it("uses exact custom dates for expense drilldown while preserving month mode", async () => {
    const fixture = vi.spyOn(db, "execute").mockImplementation(((query: unknown) => {
      const text = queryText(query);
      return Promise.resolve({
        rows: [{ submission_id: "inside", expense_date: "2026-01-10", cents: 101 }],
      } as any);
    }) as any);
    const app = express();
    app.use((req, _res, next) => {
      req.staff = { user: { id: "owner-fixture", role: "owner" } as any, session: {} as any };
      next();
    });
    registerProfitLossRoutes(app);
    try {
      const response = await request(app)
        .get("/api/admin/profit-loss/expenses?start_date=2026-01-10&end_date=2026-01-19")
        .expect(200);
      expect(response.body).toMatchObject({
        dateRange: { startDate: "2026-01-10", endDate: "2026-01-19" },
        totalLabel: "Period total",
      });
      expect(response.body.entries).toEqual([
        { submission_id: "inside", expense_date: "2026-01-10", cents: 101 },
      ]);
      const query = queryText(fixture.mock.calls[0][0]);
      expect(query).toContain("2026-01-10");
      expect(query).toContain("2026-01-20");
      fixture.mockClear();
      await request(app).get("/api/admin/profit-loss/expenses?year=2026&month=1").expect(200);
      expect(queryText(fixture.mock.calls[0][0])).toContain("extract(year FROM s.expense_date)");
    } finally {
      fixture.mockRestore();
    }
  });

  it("uses gross payment-group MDR rounding and excludes only legacy refund reversals", () => {
    expect(mdrFeeForGroup(250, 202)).toBe(5);
    expect(grossSalesCents([
      { totalCents: 101, status: "done", legacySource: null },
      { totalCents: 101, status: "refunded", legacySource: null },
      { totalCents: 101, status: "refunded", legacySource: "KedaiPOS" },
    ])).toBe(202);
    // Two B$1.01 charges in one method/provider group are B$0.05, not B$0.06.
    expect(mdrFeeForGroup(250, 101 + 101)).toBe(5);
  });

  it("uses the report SQL net-revenue rule to subtract legacy refund reversal rows", async () => {
    // This is a read-only SQL fixture (no production-path table writes). It
    // mirrors the aggregate used by getProfitLossReport: legacy reversal rows
    // are absent from gross but all refunded rows are deducted once.
    const result = await db.execute(sql`
      WITH fixture(status, legacy_source, total_cents) AS (
        VALUES ('done'::text, NULL::text, 100), ('refunded'::text, 'KedaiPOS'::text, 100)
      )
      SELECT (
        COALESCE(SUM(CASE
          WHEN status = 'refunded' AND legacy_source IS NOT NULL THEN 0
          WHEN status <> 'refunded' OR legacy_source IS NULL THEN total_cents
          ELSE 0
        END), 0)
        - COALESCE(SUM(CASE WHEN status = 'refunded' THEN total_cents ELSE 0 END), 0)
      )::int AS pos_net_cents
      FROM fixture
    `);
    expect(Number((result.rows[0] as { pos_net_cents: number }).pos_net_cents)).toBe(0);
  });

  it("limits YTD to the Brunei current month and recomputes rather than sums margins", () => {
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      lines: [
        { key: "revenue", cents: 10_000 },
        { key: "net_profit", cents: index % 2 ? 1_000 : -500 },
        { key: "profit_margin_bps", cents: 9_999 },
      ],
    }));
    const current = buildYtdFromMonths(months, 2026, "2026-09-13");
    expect(current.ytdThroughMonth).toBe(9);
    expect(current.ytd.revenue).toBe(90_000);
    expect(current.ytd.net_profit).toBe(1_500);
    expect(current.ytd.profit_margin_bps).toBe(167);
    expect(buildYtdFromMonths(months, 2025, "2026-09-13").ytdThroughMonth).toBe(12);
    const future = buildYtdFromMonths(months, 2027, "2026-09-13");
    expect(future.ytdThroughMonth).toBe(0);
    expect(future.ytd.revenue).toBe(0);
  });

  it("downgrades otherwise-live coverage when review warnings exist", () => {
    expect(deriveCoverageStatus("live", true, false)).toBe("live");
    expect(deriveCoverageStatus("live", true, true)).toBe("provisional");
    expect(deriveCoverageStatus("live", false, false)).toBe("provisional");
    expect(deriveCoverageStatus("stale", true, false)).toBe("stale");
  });

  it("fails closed when Connecteam paging is malformed or partial", async () => {
    const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const completeFetch = vi.fn(async (url: string) => {
      const offset = new URL(url).searchParams.get("offset");
      return offset === "0"
        ? response({ data: { formSubmissions: [{ formSubmissionId: "one" }] }, paging: { offset: 1, total: 1 } })
        : response({ data: { formSubmissions: [] }, paging: { offset: 1, total: 1 } });
    });
    await expect(fetchAllConnecteamSubmissions("not-a-real-key", completeFetch as typeof fetch))
      .resolves.toEqual([{ formSubmissionId: "one" }]);
    const partialFetch = vi.fn(async () => response({
      data: { formSubmissions: [{ formSubmissionId: "one" }] }, paging: { offset: 3, total: 2 },
    }));
    await expect(fetchAllConnecteamSubmissions("not-a-real-key", partialFetch as typeof fetch))
      .rejects.toThrow("connecteam_invalid_paging");
    expect(() => validateConnecteamSnapshot([{ formSubmissionId: "one", answers: [] }, { formSubmissionId: "one", answers: [] }]))
      .toThrow("connecteam_duplicate_submission");
    expect(() => validateConnecteamSnapshot([{ formSubmissionId: "one" }]))
      .toThrow("connecteam_invalid_response");
  });

  it("retains missing accounting values as explicit review cases", () => {
    const missing = sanitizeConnecteamSubmission({
      formSubmissionId: "missing-values",
      answers: [
        { questionId: "e8fb454f-fce3-5925-b55d-56de962721de", selectedAnswers: [{ text: "KB Branch" }] },
        { questionId: "e1952c17-91ee-e2da-5e88-090f05658828", selectedAnswers: [{ text: "Bonus *PgH approval*" }] },
      ],
    });
    expect(missing).toMatchObject({
      expenseDate: null, amountCents: null, sourceCategory: "Bonus *PgH approval*",
      branchChoices: [], eligible: true,
    });
    expect(mapPnlExpenseCategory("Bonus *PgH approval*")).toBe("Bonus");
  });

  it("retains advance salary as informational, never wages or an unmapped expense", () => {
    for (const label of ["Advance Salary", "Advance Salary *Pg H approval*", " ADVANCE SALARY "]) {
      expect(isInformationalPnlExpense(label)).toBe(true);
      expect(mapPnlExpenseCategory(label)).toBeUndefined();
      const allocations = planConnecteamExpenseAllocations({
        submissionId: "advance-fixture", sourceUpdatedAt: null, expenseDate: "2026-06-01",
        amountCents: 10000, sourceStatus: "Approved", sourceCategory: label,
        branchChoices: ["Tungku"], eligible: true, contentHash: "test",
      }, [{ id: "1", name: "Tungku" }]);
      expect(allocations).toEqual([{
        allocationKey: "1", branchId: "1", pnlCategory: null,
        allocationStatus: "excluded_advance_salary", cents: 10000,
      }]);
    }
    expect(mapPnlExpenseCategory("Staff Salary")).toBe("Staff Wages");
  });

  it("keeps an unknown category split against its known branch for review", () => {
    const submission = sanitizeConnecteamSubmission({
      formSubmissionId: "known-branch-unknown-category",
      answers: [
        { questionId: "e8fb454f-fce3-5925-b55d-56de962721de", selectedAnswers: [{ text: "All" }] },
        { questionId: "ea53efbb-36f2-b8f3-15e9-b8e579becd84", timestamp: 1_780_000_000 },
        { questionId: "e1952c17-91ee-e2da-5e88-090f05658828", selectedAnswers: [{ text: "New vendor category" }] },
        { questionId: "5ddac283-6e65-77aa-40f1-93661b0b17b8", inputValue: "1.01" },
      ],
    })!;
    const allocations = planConnecteamExpenseAllocations(submission, [
      { id: "1", name: "Tungku" }, { id: "2", name: "Salar" }, { id: "3", name: "Bengkurong" },
      { id: "4", name: "Tutong" }, { id: "5", name: "Lambak" },
    ]);
    expect(allocations).toHaveLength(5);
    expect(allocations.every((row) => row.allocationStatus === "unmapped_category" && row.branchId !== null)).toBe(true);
    expect(allocations.reduce((total, row) => total + row.cents, 0)).toBe(101);
  });
});