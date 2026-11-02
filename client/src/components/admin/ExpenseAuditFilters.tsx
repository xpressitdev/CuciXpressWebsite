import { useState } from "react";
import { TableHead, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { ExpenseEntry } from "./ProfitLossTab";

export const allocationLabel = (entry: ExpenseEntry) => entry.allocation_status === "excluded_advance_salary"
  ? "Information only — excluded from expenses" : entry.pnl_category ?? entry.allocation_status;
const columns = [
  { label: "Expense date", value: (e: ExpenseEntry) => e.expense_date },
  { label: "Category", value: (e: ExpenseEntry) => e.source_category ?? "Unmapped" },
  { label: "Status", value: (e: ExpenseEntry) => e.source_status ?? "No status" },
  { label: "Allocation", value: allocationLabel },
  { label: "Amount", value: (e: ExpenseEntry) => (e.cents / 100).toFixed(2) },
];
export function filterAuditEntries(entries: ExpenseEntry[], filters: string[]) {
  return entries.filter(entry => columns.every((column, index) => {
    const filter = filters[index]?.trim().toLowerCase() ?? "";
    const value = column.value(entry).toLowerCase();
    return !filter || (index > 0 && index < 4 ? value === filter : value.includes(filter));
  }));
}
export function useExpenseAuditFilters(entries: ExpenseEntry[], resetPage: () => void) {
  const [filters, setFilters] = useState(["", "", "", "", ""]);
  return {
    entries: filterAuditEntries(entries, filters),
    controls: <ExpenseAuditFilters entries={entries} filters={filters} onChange={next => {
      setFilters(next);
      resetPage();
    }} />,
    hasFilters: filters.some(Boolean),
  };
}
function ExpenseAuditFilters({ entries, filters, onChange }: {
  entries: ExpenseEntry[]; filters: string[]; onChange: (filters: string[]) => void;
}) {
  return <TableRow>
    {columns.map((column, index) => <TableHead key={column.label} className="py-2">
      {index === 0 || index === 4
        ? <Input aria-label={`Filter ${column.label}`} placeholder={index === 0 ? "YYYY-MM-DD" : "Amount in BND"}
            value={filters[index]} onChange={event => onChange(filters.map((v, i) => i === index ? event.target.value : v))} />
        : <select aria-label={`Filter ${column.label}`} className="h-10 w-full min-w-28 max-w-64 rounded-md border border-input bg-background px-2 text-sm font-normal"
            value={filters[index]} onChange={event => onChange(filters.map((v, i) => i === index ? event.target.value : v))}>
            <option value="">All {column.label.toLowerCase()}</option>
            {[...new Set(entries.map(column.value))].sort().map(value => <option key={value} value={value.toLowerCase()}>{value}</option>)}
          </select>}
      {index === 0 && filters.some(Boolean) && <button type="button" className="mt-1 text-xs underline" onClick={() => onChange(["", "", "", "", ""])}>Clear filters</button>}
    </TableHead>)}
  </TableRow>;
}

export function AuditYearSelect({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  const lastYear = Math.max(new Date().getFullYear() + 1, year);
  return <>
    <label className="text-sm" htmlFor="expense-audit-year">Year</label>
    <select id="expense-audit-year" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={year} onChange={e => onChange(Number(e.target.value))}>
      {Array.from({ length: lastYear - 2019 }, (_, i) => 2020 + i).map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  </>;
}
