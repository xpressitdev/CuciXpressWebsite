import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { PNL_MONTHS } from "@shared/profitLoss";

type Line = { key: string; label: string; cents: number };
type Report = {
  year: number;
  branchId: string;
  branches: Array<{ id: string; name: string }>;
  months: Array<{ month: number; lines: Line[]; depreciationConfigured: boolean }>;
  ytd: Record<string, number>;
  coverage: {
    status: string;
    note: string;
    depreciationMissingMonths: number[];
    warnings?: Array<string | CoverageWarning>;
    ranges?: CoverageRanges;
  };
  sync: { status: string; lastSuccessfulAt?: string; errorCode?: string; expectedSubmissionCount?: number };
};
type CoverageWarning = {
  code?: string;
  count?: number;
  missingDateCount?: number;
  missingAmountCount?: number;
  knownCents?: number;
};
type CoverageObservedRange = {
  firstDate: string | null;
  lastDate: string | null;
};
type CoverageRanges = {
  requested?: Record<string, string | null>;
  observed?: Record<string, CoverageObservedRange | null>;
};
type ExpenseEntry = {
  submission_id: string; expense_date: string; source_category: string | null;
  source_status: string | null; branch_id: number | null; pnl_category: string | null;
  allocation_status: string; cents: number;
};

const bnd = (cents: number) => new Intl.NumberFormat("en-BN", {
  style: "currency", currency: "BND", minimumFractionDigits: 2,
}).format(cents / 100);

function queryUrl(year: number, branchId: string) {
  return `/api/admin/profit-loss?year=${year}&branch_id=${encodeURIComponent(branchId)}`;
}

function expensesQueryUrl(year: number, month: string, branchId: string) {
  return `/api/admin/profit-loss/expenses?year=${year}&month=${month}&branch_id=${encodeURIComponent(branchId)}`;
}

function reportScopeKey(year: number, branchId: string) {
  return `${year}:${branchId}`;
}

function isReportQueryKey(queryKey: readonly unknown[]) {
  const key = queryKey[0];
  return typeof key === "string" && key.startsWith("/api/admin/profit-loss?");
}

function isExpensesQueryKey(queryKey: readonly unknown[]) {
  const key = queryKey[0];
  return typeof key === "string" && key.startsWith("/api/admin/profit-loss/expenses?");
}

const EXPENSES_PER_PAGE = 25;

function coverageWarningText(warning: string | CoverageWarning) {
  if (typeof warning === "string") return warning;
  return Object.entries(warning)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function coverageRangeLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function coverageRangeValue(value: string | null | undefined) {
  return value ?? "No data";
}

function observedRangeText(value: CoverageObservedRange | null | undefined) {
  if (!value) return "No data";
  return `First date: ${coverageRangeValue(value.firstDate)} · Last date: ${coverageRangeValue(value.lastDate)}`;
}

function marginText(bps: number | undefined, revenueCents: number) {
  if (revenueCents === 0 || bps === undefined || !Number.isFinite(bps)) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

export default function ProfitLossTab() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [branchId, setBranchId] = useState("overall");
  const [drilldownMonth, setDrilldownMonth] = useState("1");
  // Drafts are keyed by the complete report scope. A draft from one
  // branch/year must never appear in, or be submitted for, another.
  const [depreciation, setDepreciation] = useState<Record<string, Record<number, string>>>({});
  const [depreciationValidation, setDepreciationValidation] = useState<Record<string, boolean>>({});
  const [expensePage, setExpensePage] = useState(1);
  const scopeKey = reportScopeKey(year, branchId);
  const currentDepreciation = depreciation[scopeKey] ?? {};
  const reportUrl = queryUrl(year, branchId);
  const expensesUrl = expensesQueryUrl(year, drilldownMonth, branchId);

  useEffect(() => {
    setExpensePage(1);
  }, [year, branchId, drilldownMonth]);

  const reportQuery = useQuery<Report>({
    queryKey: [reportUrl],
    refetchInterval: 60_000, // live POS revenue, while the source sync runs every ten minutes
  });
  const report = reportQuery.data;
  const expensesQuery = useQuery<{ entries: ExpenseEntry[] }>({
    queryKey: [expensesUrl],
    enabled: Boolean(report),
  });
  const sync = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/profit-loss/sync", {}).then((response) => response.json()),
    // Sync pulls source data used by both surfaces. Invalidate every cached
    // P&L report and audit query rather than the selection captured when the
    // button was clicked; the owner may switch year/branch while it runs.
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ predicate: (query) => isReportQueryKey(query.queryKey) }),
      queryClient.invalidateQueries({ predicate: (query) => isExpensesQueryKey(query.queryKey) }),
    ]),
  });
  const saveDepreciation = useMutation({
    mutationFn: ({ year: saveYear, branchId: saveBranchId, month, cents }: {
      year: number; branchId: string; month: number; cents: number;
      scopeKey: string; draftValue: string | undefined;
    }) =>
      apiRequest("PUT", "/api/admin/profit-loss/depreciation", {
        year: saveYear, month, branch_id: Number(saveBranchId), cents,
      }),
    onSuccess: (_data, variables) => {
      // Always invalidate the report that was submitted, not whichever report
      // happens to be selected when an asynchronous response arrives.
      const invalidation = queryClient.invalidateQueries({
        queryKey: [queryUrl(variables.year, variables.branchId)],
      });
      setDepreciation((old) => {
        const scoped = old[variables.scopeKey];
        if (!scoped || scoped[variables.month] !== variables.draftValue) return old;
        const nextScoped = { ...scoped };
        delete nextScoped[variables.month];
        return { ...old, [variables.scopeKey]: nextScoped };
      });
      return invalidation;
    },
  });
  const rows = useMemo(() => report?.months[0]?.lines ?? [], [report]);
  const expenseEntries = expensesQuery.data?.entries ?? [];
  const expensePageCount = Math.max(1, Math.ceil(expenseEntries.length / EXPENSES_PER_PAGE));
  const visibleExpensePage = Math.min(expensePage, expensePageCount);
  const visibleExpenseEntries = expenseEntries.slice(
    (visibleExpensePage - 1) * EXPENSES_PER_PAGE,
    visibleExpensePage * EXPENSES_PER_PAGE,
  );
  const firstVisibleExpense = expenseEntries.length === 0
    ? 0 : (visibleExpensePage - 1) * EXPENSES_PER_PAGE + 1;
  const lastVisibleExpense = Math.min(visibleExpensePage * EXPENSES_PER_PAGE, expenseEntries.length);

  if (reportQuery.isPending && !report) return (
    <Card><CardContent className="py-10" role="status" aria-live="polite">Loading live P&amp;L…</CardContent></Card>
  );
  if (!report) return (
    <Card><CardContent className="py-10 text-red-700" role="alert">Profit &amp; Loss is temporarily unavailable. Existing accounting data has not been replaced.</CardContent></Card>
  );

  const coverageWarnings = (report.coverage.warnings ?? []).map(coverageWarningText);
  const missingDepreciation = report.coverage.depreciationMissingMonths ?? [];
  const coverageWarningItems = [
    ...coverageWarnings,
    ...(missingDepreciation.length
      ? [`Depreciation needs configuration for ${missingDepreciation.map((month) => PNL_MONTHS[month - 1] ?? `month ${month}`).join(", ")}`]
      : []),
  ];
  const coverageHealthy = report.coverage.status === "live" && coverageWarningItems.length === 0;
  const coverageLabel = coverageHealthy
    ? "Live"
    : report.coverage.status === "live" ? "Needs attention" : report.coverage.status;
  const requestedRanges = Object.entries(report.coverage.ranges?.requested ?? {});
  const observedRanges = Object.entries(report.coverage.ranges?.observed ?? {});

  return <div className="space-y-5">
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex flex-wrap items-center justify-between gap-3">
        <span>Profit &amp; Loss</span>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: Math.max(1, new Date().getFullYear() - 2019) }, (_, index) => 2020 + index)
              .concat(new Date().getFullYear() + 1)
              .filter((value, index, all) => all.indexOf(value) === index)
              .map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="overall">Overall (incl. unallocated online)</SelectItem>
              {report.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending} data-testid="button-profit-loss-sync">
            <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />Sync Connecteam
          </Button>
        </div>
      </CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {reportQuery.isFetching && <p className="text-muted-foreground" role="status" aria-live="polite">Refreshing live P&amp;L…</p>}
        {reportQuery.isError && <p className="text-red-700" role="alert">The latest P&amp;L refresh failed. Showing the last successfully fetched report.</p>}
        {sync.isPending && <p className="text-muted-foreground" role="status" aria-live="polite">Syncing Connecteam expenses…</p>}
        {sync.isError && <p className="text-red-700" role="alert">Connecteam sync failed. Existing synced expense data was not replaced.</p>}
        {sync.isSuccess && !sync.isPending && !sync.isError && <p className={coverageHealthy ? "text-emerald-700" : "text-amber-800"} role="status">Connecteam sync completed; refreshing the report and audit entries.</p>}
        <div className={`flex gap-2 ${coverageHealthy ? "text-emerald-700" : "text-amber-800"}`} role="status">
          {coverageHealthy
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span><b>{coverageLabel}</b> · {report.coverage.note}</span>
        </div>
        {coverageWarningItems.length > 0 && <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="list-disc space-y-1 pl-4">
            {coverageWarningItems.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
          </ul>
        </div>}
        {(requestedRanges.length > 0 || observedRanges.length > 0) && <div className="border-t pt-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Source ranges</p>
          {requestedRanges.length > 0 && <div className="mt-1">
            <p className="font-medium text-foreground">Requested</p>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
              {requestedRanges.map(([key, value]) => <div className="contents" key={key}>
                <dt className="font-medium">{coverageRangeLabel(key)}</dt>
                <dd>{coverageRangeValue(value)}</dd>
              </div>)}
            </dl>
          </div>}
          {observedRanges.length > 0 && <div className="mt-2">
            <p className="font-medium text-foreground">Observed</p>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
              {observedRanges.map(([key, value]) => <div className="contents" key={key}>
                <dt className="font-medium">{coverageRangeLabel(key)}</dt>
                <dd>{observedRangeText(value)}</dd>
              </div>)}
            </dl>
          </div>}
        </div>}
        <p className="text-muted-foreground">
          Connecteam: <b>{report.sync.status}</b>
          {report.sync.lastSuccessfulAt ? ` · last complete sync ${new Date(report.sync.lastSuccessfulAt).toLocaleString()}` : ""}
          {report.sync.errorCode ? ` · ${report.sync.errorCode}` : ""}
        </p>
      </CardContent>
    </Card>

    <Card className="overflow-hidden">
      <CardContent className="p-0 overflow-x-auto">
        <Table data-testid="table-profit-loss" className="min-w-[980px]">
          <TableHeader><TableRow><TableHead className="min-w-64">P&amp;L line (BND)</TableHead>
            {PNL_MONTHS.map((month) => <TableHead className="text-right" key={month}>{month}</TableHead>)}
            <TableHead className="text-right font-bold">YTD</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((row) => {
            const isTotal = ["revenue", "cost_of_services", "gross_profit", "operating_expense", "ebitda", "net_profit"].includes(row.key);
            const isMargin = row.key === "profit_margin_bps";
            return <TableRow key={row.key} className={isTotal ? "bg-muted/50 font-semibold" : row.key === "unmapped_expenses" ? "bg-amber-50 text-amber-900" : ""}>
              <TableCell>{row.label}</TableCell>
              {report.months.map((month) => <TableCell className="text-right tabular-nums" key={month.month}>
                {isMargin
                  ? marginText(lineFor(month.lines, row.key), lineFor(month.lines, "revenue"))
                  : bnd(lineFor(month.lines, row.key))}
              </TableCell>)}
              <TableCell className="text-right tabular-nums font-bold">
                {isMargin
                  ? marginText(report.ytd[row.key], report.ytd.revenue ?? 0)
                  : bnd(report.ytd[row.key] ?? 0)}
              </TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </CardContent>
    </Card>

    {branchId !== "overall" && <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" />Depreciation settings</CardTitle></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {report.months.map((item) => {
          const existing = lineFor(item.lines, "depreciation");
          const inputKey = `${scopeKey}:${item.month}`;
          const value = currentDepreciation[item.month] ?? (existing / 100).toFixed(2);
          const savePending = saveDepreciation.isPending
            && saveDepreciation.variables?.scopeKey === scopeKey
            && saveDepreciation.variables.month === item.month;
          return <div className="flex items-center gap-2" key={item.month}>
            <label className="w-9 shrink-0 text-sm" htmlFor={`depreciation-${scopeKey}-${item.month}`}>{PNL_MONTHS[item.month - 1]}</label>
            <Input aria-label={`${PNL_MONTHS[item.month - 1]} depreciation`} className="h-9 min-w-0" type="number" min="0" step="0.01"
              id={`depreciation-${scopeKey}-${item.month}`}
              value={value}
              aria-invalid={depreciationValidation[inputKey] || undefined}
              onChange={(event) => {
                setDepreciation((old) => ({
                  ...old,
                  [scopeKey]: { ...(old[scopeKey] ?? {}), [item.month]: event.target.value },
                }));
                setDepreciationValidation((old) => {
                  if (!old[inputKey]) return old;
                  const next = { ...old };
                  delete next[inputKey];
                  return next;
                });
              }} />
            <Button size="sm" variant="outline" disabled={savePending} onClick={() => {
              const raw = value.trim();
              const parsed = Number(raw);
              if (!raw || !Number.isFinite(parsed) || parsed < 0) {
                setDepreciationValidation((old) => ({ ...old, [inputKey]: true }));
                return;
              }
              saveDepreciation.mutate({
                year, branchId, scopeKey, month: item.month, cents: Math.round(parsed * 100),
                draftValue: currentDepreciation[item.month],
              });
            }}>{savePending ? "Saving…" : "Save"}</Button>
            {depreciationValidation[inputKey] && <p className="text-xs text-red-700">Enter a non-negative amount.</p>}
          </div>;
        })}
        {saveDepreciation.isError && saveDepreciation.variables?.scopeKey === scopeKey
          && <p className="text-sm text-red-700" role="alert">Depreciation could not be saved. Please try again.</p>}
        {saveDepreciation.isSuccess && saveDepreciation.variables?.scopeKey === scopeKey && !saveDepreciation.isPending
          && <p className="text-sm text-emerald-700" role="status">Depreciation saved.</p>}
      </CardContent>
    </Card>}

    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Expense audit drilldown</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="mb-3 flex items-center gap-2"><label className="text-sm">Month</label>
          <Select value={drilldownMonth} onValueChange={setDrilldownMonth}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{PNL_MONTHS.map((name, index) => <SelectItem key={name} value={String(index + 1)}>{name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {expensesQuery.isPending || expensesQuery.isFetching
          ? <p className="text-sm text-muted-foreground" role="status" aria-live="polite">Loading expense audit entries…</p>
          : null}
        {expensesQuery.isError
          ? <p className="text-sm text-red-700" role="alert">Expense audit entries are temporarily unavailable.</p>
          : null}
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader><TableRow><TableHead className="whitespace-nowrap">Expense date</TableHead><TableHead className="whitespace-nowrap">Category</TableHead><TableHead className="whitespace-nowrap">Status</TableHead><TableHead className="whitespace-nowrap">Allocation</TableHead><TableHead className="whitespace-nowrap text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>{visibleExpenseEntries.map((entry) => <TableRow key={`${entry.submission_id}-${entry.branch_id ?? entry.allocation_status}`}>
              <TableCell className="whitespace-nowrap">{entry.expense_date}</TableCell><TableCell>{entry.source_category ?? "Unmapped"}</TableCell>
              <TableCell>{entry.source_status ?? "No status"}</TableCell><TableCell>{entry.pnl_category ?? entry.allocation_status}</TableCell>
              <TableCell className="whitespace-nowrap text-right">{bnd(entry.cents)}</TableCell>
            </TableRow>)}
            {!expensesQuery.isPending && !expensesQuery.isFetching && !expensesQuery.isError && expensesQuery.data
              && !expenseEntries.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No persisted expense entries for this period.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {expenseEntries.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Showing {firstVisibleExpense}–{lastVisibleExpense} of {expenseEntries.length} entries</span>
          <div className="flex items-center gap-2" aria-label="Expense audit pagination">
            <Button size="sm" variant="outline" disabled={visibleExpensePage <= 1} onClick={() => setExpensePage((page) => Math.max(1, page - 1))}>Previous</Button>
            <span aria-live="polite">Page {visibleExpensePage} of {expensePageCount}</span>
            <Button size="sm" variant="outline" disabled={visibleExpensePage >= expensePageCount} onClick={() => setExpensePage((page) => Math.min(expensePageCount, page + 1))}>Next</Button>
          </div>
        </div>}
        <p className="mt-3 text-xs text-muted-foreground">Audit view intentionally excludes receipt images, bank/account details, descriptions, and submitter identity.</p>
      </CardContent>
    </Card>
  </div>;
}

function lineFor(lines: Line[], key: string) {
  return lines.find((line) => line.key === key)?.cents ?? 0;
}