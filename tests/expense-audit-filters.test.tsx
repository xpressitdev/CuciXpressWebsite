// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { filterAuditEntries, useExpenseAuditFilters, AuditYearSelect } from "@/components/admin/ExpenseAuditFilters";
import type { ExpenseEntry } from "@/components/admin/ProfitLossTab";
const entries: ExpenseEntry[] = [
  { submission_id: "1", expense_date: "2026-10-01", source_category: "Rental", source_status: "Approve", branch_id: 1, pnl_category: "Building Rental", allocation_status: "allocated", cents: 50000 },
  { submission_id: "2", expense_date: "2026-10-02", source_category: "Wages", source_status: null, branch_id: 1, pnl_category: "Staff Wages", allocation_status: "allocated", cents: 25000 },
];
afterEach(cleanup);
describe("Expense audit filters", () => {
  it("combines all column filters before pagination", () => {
    expect(filterAuditEntries(entries, ["2026-10", "rental", "approve", "building rental", "500.00"])).toEqual([entries[0]]);
    expect(filterAuditEntries(entries, ["", "", "no status", "staff wages", ""])).toEqual([entries[1]]);
    expect(filterAuditEntries(entries, ["", "", "approve", "staff wages", ""])).toEqual([]);
  });
  it("filters and clears through the controls", () => {
    function Harness() {
      const f = useExpenseAuditFilters(entries, () => {});
      return <><table><thead>{f.controls}</thead></table><output>{f.entries.length}</output></>;
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Filter Allocation"), { target: { value: "building rental" } });
    expect(screen.getByRole("status").textContent).toBe("1");
    fireEvent.click(screen.getByText("Clear filters"));
    expect(screen.getByRole("status").textContent).toBe("2");
  });
  it("allows changing the audit year", () => {
    let selected = 2026;
    render(<AuditYearSelect year={2026} onChange={y => { selected = y; }} />);
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2025" } });
    expect(selected).toBe(2025);
  });
});
