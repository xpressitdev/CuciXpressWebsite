import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { PNL_MONTHS } from "@shared/profitLoss";
import ProfitLossRangeControls, {
  type ProfitLossDateRange, type ProfitLossRangeMode,
} from "@/components/admin/ProfitLossRangeControls";
import {
  bnd, queryUrl, expensesQueryUrl, monthKeyFor, monthHeading,
  type Line, type ExpenseEntry,
} from "@/components/admin/ProfitLossTab";

export type ExpenseReport = {
  expenseView: true;
  year?: number;
  branchId: string;
  branches: Array<{ id: string; name: string }>;
  months: Array<{ month: number; year?: number; monthKey?: string; lines: Line[] }>;
  ytd: Record<string, number>;
  totalLabel?: string;
  coverage: { status?: string; note: string };
  sync: { status: string; lastSuccessfulAt?: string };
};

const PAGE_SIZE = 25;
const stickyColumn = "sticky left-0 z-20 min-w-[180px] border-r border-border bg-background";

/**
 * A separate read-only surface: no owner tabs, sync/depreciation mutations,
 * reminders, or revenue queries are mounted here. The server allowlists the
 * report and audit payloads; the marker check fails closed on a full report.
 */
export default function ExpenseProfitLossTab({ staffId }: { staffId: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [branchId, setBranchId] = useState("overall");
  const [mode, setMode] = useState<ProfitLossRangeMode>("year");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedRange, setAppliedRange] = useState<ProfitLossDateRange | null>(null);
  const [month, setMonth] = useState("1");
  const [page, setPage] = useState(1);
  const dateRange = mode === "custom" ? appliedRange : null;
  const reportUrl = queryUrl(year, branchId, dateRange);
  const auditUrl = expensesQueryUrl(year, month, branchId, dateRange);

  useEffect(() => {
    setPage(1);
  }, [year, branchId, month, dateRange?.startDate, dateRange?.endDate]);

  const reportQuery = useQuery<ExpenseReport>({
    // Keep owner and different staff caches separate even on the same URL.
    queryKey: [reportUrl, "expense_viewer", staffId],
    queryFn: async () => {
      const response = await apiRequest("GET", reportUrl);
      const data = await response.json();
      if (data.expenseView !== true) throw new Error("Expense-only report required");
      return data as ExpenseReport;
    },
    refetchInterval: (query) => query.state.data?.sync.status === "running" ? 5_000 : 60_000,
  });
  const report = reportQuery.data?.expenseView === true ? reportQuery.data : undefined;
  const auditQuery = useQuery<{ entries: ExpenseEntry[] }>({
    queryKey: [auditUrl, "expense_viewer", staffId],
    enabled: Boolean(report),
  });
  const entries = auditQuery.data?.entries ?? [];
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const visibleEntries = entries.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  if (reportQuery.isPending) return (
    <Card><CardContent className="space-y-3 py-10" role="status" aria-live="polite">
      <p>Loading expense report…</p>
      <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />
      <div className="h-6 w-full rounded bg-muted animate-pulse" />
    </CardContent></Card>
  );
  if (!report) return (
    <Card><CardContent className="space-y-3 py-10">
      <p className="text-red-700" role="alert">Expense report is temporarily unavailable.</p>
      <Button variant="outline" onClick={() => void reportQuery.refetch()}>Retry</Button>
    </CardContent></Card>
  );

  const reportYear = report.year ?? (dateRange ? Number(dateRange.startDate.slice(0, 4)) : year);
  // The server provides ONLY COS/OPEX totals and their expense detail keys.
  const rows = report.months[0]?.lines ?? [];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, currentYear - 2019) }, (_, index) => 2020 + index)
    .concat(currentYear + 1);

  return <div className="space-y-5" data-testid="expense-only-profit-loss">
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span>Profit &amp; Loss · Expenses</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <ProfitLossRangeControls
              mode={mode} year={year} years={years} startDate={startDate} endDate={endDate}
              onModeChange={(nextMode) => {
                setMode(nextMode);
                if (nextMode === "year") {
                  setAppliedRange(null);
                  setStartDate("");
                  setEndDate("");
                }
              }}
              onYearChange={setYear} onStartDateChange={setStartDate}
              onEndDateChange={setEndDate} onApply={setAppliedRange}
            />
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-full max-w-full sm:w-44" aria-label="Report branch"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">Overall (incl. unallocated expenses)</SelectItem>
                {report.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">Read-only access to Cost of Services (COS) and Operating Expenses (OPEX).</p>
        {reportQuery.isFetching && <p role="status" aria-live="polite">Refreshing expense report…</p>}
        {reportQuery.isError && <div role="alert" className="text-red-700">
          The latest refresh failed. Showing the last successfully fetched expense report.
          <Button variant="outline" size="sm" className="ml-2" onClick={() => void reportQuery.refetch()}>Retry</Button>
        </div>}
        <p role="status">{report.coverage.note}</p>
        {dateRange && <p className="text-muted-foreground">Expenses use the inclusive dates in the selected range.</p>}
        <p className="text-muted-foreground">
          Connecteam: <b>{report.sync.status}</b>
          {report.sync.lastSuccessfulAt ? ` · last complete sync ${new Date(report.sync.lastSuccessfulAt).toLocaleString()}` : ""}
        </p>
      </CardContent>
    </Card>
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <Table data-testid="table-profit-loss" className="min-w-[980px] border-separate border-spacing-0" containerClassName="isolate max-h-[70dvh]">
          <TableHeader><TableRow>
            <TableHead className={`${stickyColumn} top-0 z-40 border-b font-semibold`}>Expense line (BND)</TableHead>
            {report.months.map((item) => <TableHead key={monthKeyFor(item, reportYear)} className="sticky top-0 z-30 border-b bg-background whitespace-nowrap text-right">
              {monthHeading(item, reportYear, Boolean(dateRange))}
            </TableHead>)}
            <TableHead className="sticky top-0 z-30 border-b bg-background whitespace-nowrap text-right font-bold">{report.totalLabel ?? (dateRange ? "Period total" : "YTD")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => {
              const total = row.key === "cost_of_services" || row.key === "operating_expense";
              return <TableRow key={row.key} className={total ? "bg-muted/50 font-semibold" : ""}>
                <TableCell className={`${stickyColumn} border-b ${total ? "bg-muted" : ""}`}>{row.label}</TableCell>
                {report.months.map((item) => <TableCell key={monthKeyFor(item, reportYear)} className="border-b text-right tabular-nums">
                  {bnd(item.lines.find((line) => line.key === row.key)?.cents ?? 0)}
                </TableCell>)}
                <TableCell className="border-b text-right tabular-nums font-bold">{bnd(report.ytd[row.key] ?? 0)}</TableCell>
              </TableRow>;
            })}
            {!rows.length && <TableRow><TableCell colSpan={report.months.length + 2} className="py-10 text-center text-muted-foreground">No expense totals available for this period. Try a different year or branch.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Expense audit drilldown</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {dateRange ? <p className="text-sm text-muted-foreground">All dates in the selected custom range</p> : (
          <div className="flex items-center gap-2">
            <label className="text-sm" htmlFor="profit-loss-audit-month">Month</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger id="profit-loss-audit-month" className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{PNL_MONTHS.map((name, index) => <SelectItem key={name} value={String(index + 1)}>{name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {(auditQuery.isPending || auditQuery.isFetching) && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Loading expense audit entries…</p>}
        {auditQuery.isError && <div className="text-sm text-red-700" role="alert">
          Expense audit entries are temporarily unavailable.
          <Button variant="outline" size="sm" className="ml-2" onClick={() => void auditQuery.refetch()}>Retry</Button>
        </div>}
        <Table className="min-w-[700px]">
          <TableHeader><TableRow>
            <TableHead>Expense date</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Allocation</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {visibleEntries.map((entry) => <TableRow key={`${entry.submission_id}-${entry.branch_id ?? entry.allocation_status}`}>
              <TableCell className="whitespace-nowrap">{entry.expense_date}</TableCell>
              <TableCell>{entry.source_category ?? "Unmapped"}</TableCell>
              <TableCell>{entry.source_status ?? "No status"}</TableCell>
              <TableCell>{entry.allocation_status === "excluded_advance_salary" ? "Information only — excluded from expenses" : entry.pnl_category ?? entry.allocation_status}</TableCell>
              <TableCell className="whitespace-nowrap text-right">{bnd(entry.cents)}</TableCell>
            </TableRow>)}
            {!auditQuery.isPending && !auditQuery.isError && !entries.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No persisted expense entries for this period.</TableCell></TableRow>}
          </TableBody>
        </Table>
        {entries.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Showing {(activePage - 1) * PAGE_SIZE + 1}–{Math.min(activePage * PAGE_SIZE, entries.length)} of {entries.length} entries</span>
          <div className="flex items-center gap-2" aria-label="Expense audit pagination">
            <Button size="sm" variant="outline" disabled={activePage <= 1} onClick={() => setPage(activePage - 1)}>Previous</Button>
            <span aria-live="polite">Page {activePage} of {pageCount}</span>
            <Button size="sm" variant="outline" disabled={activePage >= pageCount} onClick={() => setPage(activePage + 1)}>Next</Button>
          </div>
        </div>}
      </CardContent>
    </Card>
  </div>;
}