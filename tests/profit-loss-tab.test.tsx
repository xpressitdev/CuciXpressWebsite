// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProfitLossTab from "@/components/admin/ProfitLossTab";
import { apiRequest } from "@/lib/queryClient";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

const currentYear = new Date().getFullYear();

function makeReport(
  year: number,
  branchId: string,
  coverageOverrides: Record<string, unknown> = {},
  reportOverrides: Record<string, unknown> = {},
) {
  const months = Array.from({ length: 12 }, (_, offset) => ({
    month: offset + 1,
    lines: [
      { key: "revenue", label: "Revenue", cents: 10000 },
      { key: "depreciation", label: "Asset Depreciation", cents: 0 },
      { key: "profit_margin_bps", label: "Profit Margin", cents: 1250 },
    ],
    depreciationConfigured: branchId === "overall" || offset < 6,
  }));
  return {
    year, branchId,
    branches: [{ id: "7", name: "Tungku" }, { id: "8", name: "Salar" }],
    months,
    ytd: { revenue: 120000, depreciation: 0, profit_margin_bps: 1250 },
    coverage: { status: "live", note: "Live", depreciationMissingMonths: [], ...coverageOverrides },
    sync: { status: "complete" },
    recurringExpenseReminders: [],
    ...reportOverrides,
  };
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const response = await fetch(String(queryKey[0]));
          if (!response.ok) throw new Error("request failed");
          return response.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfitLossTab />
    </QueryClientProvider>,
  );
}

async function chooseBranch(name: string) {
  const selects = screen.getAllByRole("combobox");
  fireEvent.click(selects[1]);
  fireEvent.click(await screen.findByRole("option", { name }));
  await screen.findByLabelText("Jan depreciation");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ProfitLossTab depreciation controls", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps drafts scoped to the selected branch before saving", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/expenses")) return new Response(JSON.stringify({ entries: [] }));
      return new Response(JSON.stringify(makeReport(
        Number(url.searchParams.get("year")),
        url.searchParams.get("branch_id") ?? "overall",
      )));
    }));
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    renderTab();
    await screen.findAllByRole("combobox");
    await chooseBranch("Tungku");

    fireEvent.change(screen.getByLabelText("Jan depreciation"), { target: { value: "19.99" } });
    await chooseBranch("Salar");

    const salarJanuary = screen.getByLabelText("Jan depreciation");
    expect(salarJanuary).toHaveValue(0);
    const januaryForm = salarJanuary.parentElement;
    if (!januaryForm) throw new Error("January depreciation form was not rendered");
    fireEvent.click(within(januaryForm).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "PUT",
      "/api/admin/profit-loss/depreciation",
      expect.objectContaining({ year: currentYear, month: 1, branch_id: 8, cents: 0 }),
    ));
  });

  it("allows future-month depreciation edits", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/expenses")) return new Response(JSON.stringify({ entries: [] }));
      return new Response(JSON.stringify(makeReport(
        Number(url.searchParams.get("year")),
        url.searchParams.get("branch_id") ?? "overall",
      )));
    }));
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    renderTab();
    await screen.findAllByRole("combobox");
    await chooseBranch("Tungku");

    const july = screen.getByLabelText("Jul depreciation");
    fireEvent.change(july, { target: { value: "42.10" } });
    const julyForm = july.parentElement;
    if (!julyForm) throw new Error("July depreciation form was not rendered");
    fireEvent.click(within(julyForm).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "PUT",
      "/api/admin/profit-loss/depreciation",
      expect.objectContaining({ year: currentYear, month: 7, branch_id: 7, cents: 4210 }),
    ));
  });

  it("shows every coverage warning and source range, and uses YTD margin metadata", async () => {
    const warningReport = makeReport(currentYear, "overall", {
      note: "Source note",
      warnings: ["unmapped source rows", "missing source date"],
      depreciationMissingMonths: [7],
      ranges: {
        requested: {
          expenseDate: "2026-01-01 through 2026-12-31 (Brunei calendar)",
          posRevenue: "2026-01-01 through 2026-12-31 (Brunei realization day)",
        },
        observed: {
          expenseDate: { firstDate: null, lastDate: null },
          posRevenue: { firstDate: "2026-01-03", lastDate: "2026-06-30" },
        },
      },
    });
    warningReport.months[0].lines.find((line) => line.key === "revenue")!.cents = 0;
    warningReport.months[0].lines.find((line) => line.key === "profit_margin_bps")!.cents = 0;
    warningReport.ytd.profit_margin_bps = 2500;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/expenses")) return new Response(JSON.stringify({ entries: [] }));
      return new Response(JSON.stringify(warningReport));
    }));
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    renderTab();

    expect(await screen.findByText("unmapped source rows")).toBeVisible();
    expect(screen.getByText("missing source date")).toBeVisible();
    expect(screen.getByText("Depreciation needs configuration for Jul")).toBeVisible();
    expect(screen.getByText("Expense date")).toBeVisible();
    expect(screen.getByText("2026-01-01 through 2026-12-31 (Brunei calendar)")).toBeVisible();
    expect(screen.getByText("Requested")).toBeVisible();
    expect(screen.getByText("Observed")).toBeVisible();
    expect(screen.getByText("First date: No data · Last date: No data")).toBeVisible();
    expect(screen.getByText("First date: 2026-01-03 · Last date: 2026-06-30")).toBeVisible();

    const coverageStatus = screen.getByText("Needs attention");
    expect(coverageStatus.closest("[role='status']")).toHaveClass("text-amber-800");
    expect(coverageStatus.closest("[role='status']")).not.toHaveClass("text-emerald-700");

    const marginRow = screen.getByText("Profit Margin").closest("tr");
    expect(marginRow).toHaveTextContent("25.00%");
    expect(marginRow).toHaveTextContent("—");
  });

  it("auto-opens recurring reminders, reopens from the count button, and handles an empty month filter", async () => {
    const reminders = [
      {
        category: "Management Fee",
        sourceCategory: "Management Fee",
        branchId: "7",
        branchName: "Tungku",
        year: currentYear,
        month: 1,
        monthKey: `${currentYear}-01`,
        period: "completed",
        status: "missing",
        evidenceMonths: [`${currentYear - 1}-11`, `${currentYear - 1}-12`],
        pattern: "two-of-preceding-six",
      },
      {
        category: "Management Fee",
        sourceCategory: "Management Fee",
        branchId: "8",
        branchName: "Salar",
        year: currentYear,
        month: 2,
        monthKey: `${currentYear}-02`,
        period: "current",
        status: "pending",
        sourceStatus: "Pending",
        evidenceMonths: [`${currentYear - 1}-12`, `${currentYear}-01`],
        pattern: "two-of-preceding-six",
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/expenses")) return new Response(JSON.stringify({ entries: [] }));
      return new Response(JSON.stringify(makeReport(
        Number(url.searchParams.get("year")),
        url.searchParams.get("branch_id") ?? "overall",
        {},
        { recurringExpenseReminders: reminders },
      )));
    }));

    renderTab();
    expect(await screen.findByTestId("dialog-expense-reminders")).toBeVisible();
    expect(screen.getByText("Possibly missing")).toBeVisible();
    expect(screen.getByText("Check this month · Submitted pending")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("dialog-expense-reminders")).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId("button-expense-reminders"));
    expect(await screen.findByTestId("dialog-expense-reminders")).toBeVisible();

    fireEvent.click(screen.getByRole("combobox", { name: "Reminder month" }));
    fireEvent.click(await screen.findByRole("option", { name: `Mar ${currentYear}` }));
    expect(screen.getByText("No expense reminders for this month.")).toBeVisible();
  });

  it("keeps the zero-count reminder button available with an explicit empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/expenses")) return new Response(JSON.stringify({ entries: [] }));
      return new Response(JSON.stringify(makeReport(
        Number(url.searchParams.get("year")),
        url.searchParams.get("branch_id") ?? "overall",
      )));
    }));

    renderTab();
    expect(await screen.findByTestId("button-expense-reminders")).toHaveTextContent("Expense reminders");
    expect(screen.getByTestId("button-expense-reminders")).toHaveTextContent("0");
    fireEvent.click(screen.getByTestId("button-expense-reminders"));
    expect(await screen.findByTestId("dialog-expense-reminders")).toBeVisible();
    expect(screen.getByText("No expense reminders for this month.")).toBeVisible();
  });
});