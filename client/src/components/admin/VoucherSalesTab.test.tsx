import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VoucherSalesTab from "@/components/admin/VoucherSalesTab";
import ProfitLossTab from "@/components/admin/ProfitLossTab";
import Admin from "@/pages/admin";
import { getQueryFn } from "@/lib/queryClient";
import { isVoucherAccountingQuery, newVoucherDraft, voucherDraftError, voucherRangeError, voucherSalePayload, voucherSalesUrl, type VoucherSale } from "@/lib/voucherSales";

const auth = vi.hoisted(() => ({ role: "owner" }));
vi.mock("@/hooks/useStaffAuth", () => ({
  useStaffAuth: () => ({
    staff: { id: "voucher-staff", name: "Nur Amal", role: auth.role },
    isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(),
  }),
}));
vi.mock("@/components/Navigation", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const sale: VoucherSale = {
  id: "sale-7", sale_date: "2026-01-23", buyer: "Rimba Auto Club",
  quantity: 7, unit_price_cents: 900, total_cents: 6300, branch_id: null,
  branch_name: null, payment_method: "unspecified", reference: "CX-101–107",
  notes: "Physical vouchers", status: "active", void_reason: null, created_at: "2026-01-23T04:00:00Z",
};
const report = {
  branchId: "overall", branches: [], year: 2026,
  months: [{ month: 1, depreciationConfigured: true, lines: [
    { key: "voucher_sales_revenue", label: "Voucher sales revenue", cents: 6300 },
    { key: "revenue", label: "Revenue", cents: 6300 },
  ] }],
  ytd: { voucher_sales_revenue: 6300, revenue: 6300 },
  coverage: { status: "live", note: "Live accounting", depreciationMissingMonths: [] },
  sync: { status: "succeeded" },
};
let rows: VoucherSale[];
let failSave: boolean;
let failList: boolean;
let fetchMock: ReturnType<typeof vi.fn>;
const clients: QueryClient[] = [];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function mount(component = <VoucherSalesTab />) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
  return client;
}
function writes() {
  return fetchMock.mock.calls.filter(([, options]) => options?.method && options.method !== "GET");
}

beforeEach(() => {
  auth.role = "owner";
  rows = [{ ...sale }, { ...sale, id: "sale-8", buyer: "Void buyer", status: "void", void_reason: "Duplicate entry" }];
  failSave = false;
  failList = false;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = options?.method ?? "GET";
    if (url.pathname.startsWith("/api/admin/voucher-sales")) {
      if (method === "GET") {
        if (failList) return json({ message: "Unavailable" }, 503);
        return json({ sales: rows, branches: [{ id: 7, name: "Tungku Link" }], summary: { quantity: 7, total_cents: 6300 } });
      }
      const body = JSON.parse(String(options?.body));
      if (failSave) return json({ message: "Save failed" }, 503);
      if (url.pathname.endsWith("/void")) {
        rows = rows.map((row) => row.id === sale.id ? { ...row, status: "void", void_reason: body.reason } : row);
      } else if (method === "PATCH") {
        rows = rows.map((row) => row.id === sale.id ? { ...row, ...body, total_cents: body.quantity * body.unit_price_cents } : row);
      }
      return json({ sale: { ...sale, ...body } });
    }
    if (url.pathname === "/api/admin/profit-loss/expenses") return json({ entries: [] });
    if (url.pathname === "/api/admin/profit-loss") return json(report);
    // Unrelated panels may start reads in Admin. Keep these pending so no
    // fixtures or external API/database are needed for role isolation.
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("voucher sale validation and accounting scope", () => {
  it("preserves date-only values, converts cents and makes unknown allocation explicit", () => {
    const payload = voucherSalePayload({ ...newVoucherDraft(), sale_date: "2025-12-17", buyer: "  Rimba  ", quantity: "7" });
    expect(payload).toMatchObject({ sale_date: "2025-12-17", buyer: "Rimba", quantity: 7, unit_price_cents: 900, branch_id: null, payment_method: "unspecified", reference: null, notes: null });
    for (const quantity of ["0", "-1", "1.5", ""]) expect(voucherDraftError({ ...newVoucherDraft(), buyer: "Rimba", quantity })).toBeTruthy();
    for (const unit_price of ["0", "-9", "9.001", "Infinity"]) expect(voucherDraftError({ ...newVoucherDraft(), buyer: "Rimba", unit_price })).toBeTruthy();
    expect(voucherDraftError({ ...newVoucherDraft(), buyer: "Rimba", sale_date: "2026-02-30" })).toBeTruthy();
  });
  it("requires paired ordered dates and invalidates every voucher/P&L scope, not unrelated data", () => {
    expect(voucherSalesUrl()).toBe("/api/admin/voucher-sales");
    expect(voucherSalesUrl("2025-12-17", "2026-02-03")).toBe("/api/admin/voucher-sales?start_date=2025-12-17&end_date=2026-02-03");
    expect(voucherRangeError("2026-02-03", "")).toBeTruthy();
    expect(voucherRangeError("2026-02-03", "2025-12-17")).toBeTruthy();
    expect(isVoucherAccountingQuery(["/api/admin/voucher-sales?start_date=2026-01-01&end_date=2026-02-01"])).toBe(true);
    expect(isVoucherAccountingQuery(["/api/admin/profit-loss?year=2025&branch_id=7"])).toBe(true);
    expect(isVoucherAccountingQuery(["/api/pos/orders/today"])).toBe(false);
  });
});

describe("Voucher Sales register", () => {
  it("loads all dates, displays server summary and void audit rows with redemption guidance", async () => {
    mount();
    const table = await screen.findByTestId("table-voucher-sales");
    expect(within(table).getAllByText("2026-01-23", { selector: "td" })).toHaveLength(2);
    expect(screen.getByText("Active vouchers sold").nextElementSibling).toHaveTextContent("7");
    expect(screen.getByText("Original sale date revenue").nextElementSibling).toHaveTextContent("B$63.00");
    expect(screen.getByRole("button", { name: "Edit sale for Void buyer" })).toBeDisabled();
    expect(screen.getByText("Duplicate entry")).toBeInTheDocument();
    expect(screen.getByText("$9 Voucher Redeem")).toBeInTheDocument();
    expect(screen.getByText(/Charge paid extras separately/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/voucher-sales");
  });
  it("applies paired dates only and clears back to all dates", async () => {
    mount();
    await screen.findByTestId("table-voucher-sales");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2025-12-17" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    expect(screen.getByRole("alert")).toHaveTextContent("both");
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("start_date="))).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-02-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/admin/voucher-sales?start_date=2025-12-17&end_date=2026-02-03")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "All dates" }));
    expect(screen.getByLabelText("Start date")).toHaveValue("");
  });
  it("creates with B$9 default and stable idempotency on retry, then invalidates cached P&L", async () => {
    const client = mount();
    const pnlKey = ["/api/admin/profit-loss?year=2026&branch_id=overall"];
    client.setQueryData(pnlKey, report);
    await screen.findByTestId("table-voucher-sales");
    fireEvent.click(screen.getByRole("button", { name: "Record sale" }));
    expect(screen.getByLabelText("Unit price (B$)")).toHaveValue(9);
    fireEvent.change(screen.getByLabelText("Buyer"), { target: { value: "Rimba Fleet" } });
    fireEvent.change(screen.getByLabelText("Original sale date"), { target: { value: "2025-12-17" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
    failSave = true;
    fireEvent.click(screen.getByRole("button", { name: "Save sale" }));
    await screen.findByRole("alert");
    const firstBody = JSON.parse(String(writes()[0][1].body));
    expect(firstBody).toMatchObject({ sale_date: "2025-12-17", buyer: "Rimba Fleet", quantity: 3, unit_price_cents: 900, branch_id: null, payment_method: "unspecified" });
    expect(firstBody.idempotency_key).toMatch(/^[\da-f-]{36}$/i);
    expect(writes()[0][1].credentials).toBe("include");
    failSave = false;
    fireEvent.click(screen.getByRole("button", { name: "Save sale" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(JSON.parse(String(writes()[1][1].body)).idempotency_key).toBe(firstBody.idempotency_key);
    expect(client.getQueryState(pnlKey)?.isInvalidated).toBe(true);
  });
  it("edits with unchanged original date and requires a confirmed void reason", async () => {
    mount();
    await screen.findByTestId("table-voucher-sales");
    fireEvent.click(screen.getByRole("button", { name: "Edit sale for Rimba Auto Club" }));
    expect(screen.getByLabelText("Original sale date")).toHaveValue("2026-01-23");
    fireEvent.change(screen.getByLabelText("Buyer"), { target: { value: "Rimba Fleet" } });
    fireEvent.click(screen.getByRole("button", { name: "Save sale" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()[0][0]).toBe("/api/admin/voucher-sales/sale-7");
    expect(writes()[0][1].method).toBe("PATCH");
    expect(JSON.parse(String(writes()[0][1].body))).not.toHaveProperty("idempotency_key");
    fireEvent.click(screen.getByRole("button", { name: "Void sale for Rimba Fleet" }));
    expect(screen.getByRole("button", { name: "Confirm void" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason for voiding"), { target: { value: "Duplicate sale" } });
    expect(writes()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm void" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()[1][0]).toBe("/api/admin/voucher-sales/sale-7/void");
    expect(JSON.parse(String(writes()[1][1].body))).toEqual({ reason: "Duplicate sale" });
    expect(await screen.findByText("Duplicate sale")).toBeInTheDocument();
  });
  it("offers retry after failed read and a designed empty state", async () => {
    failList = true;
    mount();
    await screen.findByRole("alert");
    failList = false;
    rows = [];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No voucher sales in this period")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record first sale" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("owner-only mounting and dynamic P&L", () => {
  it.each(["expense_viewer", "manager", "cashier", "lane", "investor"])("does not mount or request vouchers for %s", async (role) => {
    auth.role = role;
    mount(<Admin />);
    expect(screen.queryByTestId("tab-voucher-sales")).not.toBeInTheDocument();
    expect(screen.queryByTestId("voucher-sales-panel")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/voucher-sales"))).toBe(false);
  });
  it("lets owner open the register without fetching it in the background", async () => {
    mount(<Admin />);
    const tab = screen.getByTestId("tab-voucher-sales");
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/voucher-sales"))).toBe(false);
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    expect(await screen.findByTestId("table-voucher-sales")).toBeInTheDocument();
  });
  it("renders backend voucher_sales_revenue dynamically with currency values", async () => {
    mount(<ProfitLossTab />);
    const table = await screen.findByTestId("table-profit-loss");
    const row = within(table).getByText("Voucher sales revenue").closest("tr")!;
    expect(within(row).getAllByText(/63\.00/)).toHaveLength(2);
  });
});
