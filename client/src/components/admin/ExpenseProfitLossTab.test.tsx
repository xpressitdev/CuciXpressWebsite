import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Admin from "@/pages/admin";
import { getQueryFn } from "@/lib/queryClient";
import ExpenseProfitLossTab, { type ExpenseReport } from "@/components/admin/ExpenseProfitLossTab";

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/hooks/useStaffAuth", () => ({
  useStaffAuth: () => ({
    staff: { id: "expense-staff", name: "Nur Amal", role: "expense_viewer" },
    isAuthenticated: true, isLoading: false, login: vi.fn(), logout,
  }),
}));

const report: ExpenseReport = {
  expenseView: true, branchId: "overall", year: 2026,
  branches: [{ id: "7", name: "Tungku" }],
  months: [{
    month: 1,
    lines: [
      { key: "cost_of_services", label: "Cost of Services", cents: 18750 },
      { key: "operating_expense", label: "Operating Expenses", cents: 43217 },
    ],
  }],
  ytd: { cost_of_services: 18750, operating_expense: 43217 },
  coverage: { status: "live", note: "Cost of services and operating expenses only." },
  sync: { status: "succeeded", lastSuccessfulAt: "2026-01-23T03:12:00Z" },
};
const clients: QueryClient[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function renderExpense(admin = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>
    {admin ? <Admin /> : <ExpenseProfitLossTab staffId="expense-staff" />}
  </QueryClientProvider>);
  return client;
}

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/auth/whoami") return new Response(JSON.stringify({ authenticated: false }));
    if (url.pathname === "/api/admin/profit-loss/expenses") {
      return new Response(JSON.stringify({
        entries: Array.from({ length: 26 }, (_, index) => ({
          submission_id: `expense-${index}`, expense_date: "2026-01-23",
          source_category: `Expense item ${index + 1}`, source_status: "Approved",
          branch_id: 7, pnl_category: "operating_expense", allocation_status: "allocated", cents: 8750,
        })),
      }));
    }
    if (url.pathname === "/api/admin/profit-loss") return new Response(JSON.stringify(report));
    throw new Error(`Unauthorized frontend request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("expense viewer UI isolation", () => {
  it("mounts only expenses in /admin, keeps logout, and makes no other admin requests", async () => {
    renderExpense(true);
    await screen.findByText("Expense item 1");
    const table = screen.getByTestId("table-profit-loss");
    expect(within(table).getByText("Cost of Services")).toBeInTheDocument();
    expect(within(table).getByText("Operating Expenses")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-dashboard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tab-staff")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-back-to-pos")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-profit-loss-sync")).not.toBeInTheDocument();
    expect(screen.queryByText(/Depreciation settings|Profit Margin|Source ranges|Net Profit|Revenue/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-staff-logout"));
    expect(logout).toHaveBeenCalledOnce();
    for (const [input, options] of fetchMock.mock.calls) {
      expect(new URL(String(input), "http://localhost").pathname).toMatch(/^\/api\/(auth\/whoami|admin\/profit-loss(?:\/expenses)?)$/);
      expect((options as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    }
  });

  it("preserves custom dates, branch selection, annual audit and pagination", async () => {
    renderExpense();
    await screen.findByText("Expense item 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Expense item 26")).toBeInTheDocument();
    expect(screen.queryByText("Expense item 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Report branch"));
    fireEvent.click(await screen.findByRole("option", { name: "Tungku" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("branch_id=7"))).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2025-12-17" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-02-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      for (const endpoint of ["/api/admin/profit-loss?", "/api/admin/profit-loss/expenses?"]) {
        expect(fetchMock.mock.calls.some(([input]) => String(input) === `${endpoint}start_date=2025-12-17&end_date=2026-02-03&branch_id=7`)).toBe(true);
      }
    });
    expect(await screen.findByText("All dates in the selected custom range")).toBeInTheDocument();
    expect(screen.queryByText("Depreciation settings")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Year" }));
    await screen.findByLabelText("Month");
  });

  it("fails closed on a full owner report and does not request its audit", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      ...report, expenseView: undefined,
      months: [{ month: 1, lines: [{ key: "revenue", label: "Revenue", cents: 99999 }] }],
    })));
    renderExpense();
    await screen.findByText("Expense report is temporarily unavailable.");
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/expenses?"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});