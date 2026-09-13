import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  connecteamSyncErrorMessage,
  PNL_MONTHS,
  type RecurringExpenseReminder,
} from "@shared/profitLoss";

type ReminderSync = {
  status: string;
  lastSuccessfulAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

interface RecurringExpenseRemindersDialogProps {
  reminders: readonly RecurringExpenseReminder[];
  reportScope: string;
  coverageStatus: string;
  sync: ReminderSync;
}

const monthLabel = (reminder: RecurringExpenseReminder) =>
  `${PNL_MONTHS[reminder.month - 1] ?? `Month ${reminder.month}`} ${reminder.year}`;

function reminderStateLabel(reminder: RecurringExpenseReminder) {
  const periodLabel = reminder.period === "current" ? "Check this month" : "Possibly missing";
  if (reminder.status === "pending") return `${periodLabel} · Submitted pending`;
  if (reminder.status === "rejected") return `${periodLabel} · Submitted rejected`;
  return periodLabel;
}

function reminderStateClass(reminder: RecurringExpenseReminder) {
  if (reminder.status === "rejected") return "border-red-200 bg-red-50 text-red-800";
  if (reminder.status === "pending") return "border-amber-200 bg-amber-50 text-amber-900";
  return reminder.period === "current"
    ? "border-blue-200 bg-blue-50 text-blue-900"
    : "border-amber-200 bg-amber-50 text-amber-900";
}

export default function RecurringExpenseRemindersDialog({
  reminders,
  reportScope,
  coverageStatus,
  sync,
}: RecurringExpenseRemindersDialogProps) {
  const [open, setOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");
  const openedScopes = useRef(new Set<string>());

  // A report scope gets one automatic prompt when it first has suggestions.
  // Closing it is respected until the owner changes year or branch; the
  // visible count button always provides an explicit way to reopen it.
  useEffect(() => {
    if (!reminders.length || openedScopes.current.has(reportScope)) return;
    openedScopes.current.add(reportScope);
    setOpen(true);
  }, [reminders.length, reportScope]);

  useEffect(() => {
    setMonthFilter("all");
  }, [reportScope]);

  const scopeDates = reportScope.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const reportYear = scopeDates[0]
    ? Number(scopeDates[0].slice(0, 4))
    : Number(reportScope.split(":")[0]) || reminders[0]?.year;
  const monthOptions = useMemo(() => {
    if (scopeDates.length >= 2) {
      // Custom scopes carry their exact bounds. Use only the returned month
      // keys so a cross-year range never offers a same-month key from the
      // inferred first year.
      return Array.from(new Set(reminders.map((reminder) => reminder.monthKey)))
        .sort()
        .map((monthKey) => {
          const [monthYear, monthNumber] = monthKey.split("-");
          const month = Number(monthNumber);
          return {
            value: monthKey,
            label: `${PNL_MONTHS[month - 1] ?? `Month ${month}`} ${monthYear}`,
          };
        });
    }
    return PNL_MONTHS.map((label, index) => ({
      value: `${reportYear}-${String(index + 1).padStart(2, "0")}`,
      label: `${label} ${reportYear}`,
    }));
  }, [reportYear, reminders, scopeDates.join(":")]);
  const visibleReminders = monthFilter === "all"
    ? reminders
    : reminders.filter((reminder) => reminder.monthKey === monthFilter);
  const syncStatus = sync.status.toLocaleLowerCase();
  const syncMayBeStale = coverageStatus === "stale"
    || coverageStatus === "error"
    || coverageStatus === "never"
    || Boolean(sync.errorCode)
    || !["succeeded", "complete", "completed", "success"].includes(syncStatus);
  const lastSync = sync.lastSuccessfulAt
    ? new Date(sync.lastSuccessfulAt).toLocaleString()
    : null;
  const syncErrorMessage = sync.errorMessage
    ?? (sync.errorCode ? connecteamSyncErrorMessage(sync.errorCode) : null);

  return (
    <>
      <Button
        variant="outline"
        className="relative"
        onClick={() => setOpen(true)}
        aria-label={`Expense reminders, ${reminders.length}`}
        data-testid="button-expense-reminders"
      >
        <CalendarClock className="mr-2 h-4 w-4" />
        Expense reminders
        <Badge variant="secondary" className="ml-2 min-w-5 justify-center px-1.5">
          {reminders.length}
        </Badge>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="dialog-expense-reminders">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Recurring expense reminders
            </DialogTitle>
            <DialogDescription>
              These are review prompts for expenses that often recur at this branch.
              They are not proof of debt and do not create accounting or Connecteam records.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="flex items-start gap-2">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                A category is suggested only after it was captured in at least two
                distinct preceding months within the recent six-month window.
                Each canonical branch is checked separately.
              </span>
            </p>
          </div>

          {syncMayBeStale && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Suggestions may be outdated because the Connecteam expense sync is
                {syncStatus === "never" ? " not complete yet" : ` ${sync.status}`}.
                {lastSync ? ` Last complete sync: ${lastSync}.` : ""}
                 {syncErrorMessage ? ` ${syncErrorMessage}` : ""}
              </span>
            </div>
          )}
          {!syncMayBeStale && (
            <p className="text-xs text-muted-foreground">
              Last complete sync: {lastSync ?? "not reported"}.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium" htmlFor="expense-reminder-month">Month</label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger id="expense-reminder-month" className="w-40" aria-label="Reminder month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {monthOptions.map((month) => (
                  <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {visibleReminders.map((reminder) => (
              <div
                key={`${reminder.branchId}-${reminder.category}-${reminder.monthKey}`}
                className="rounded-md border p-3"
                data-testid={`expense-reminder-${reminder.monthKey}-${reminder.branchId}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{reminder.category}</p>
                    <p className="text-sm text-muted-foreground">
                      {reminder.branchName ?? `Branch ${reminder.branchId}`} · {monthLabel(reminder)}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-medium ${reminderStateClass(reminder)}`}>
                    {reminderStateLabel(reminder)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Source label: {reminder.sourceCategory} · Pattern seen in {reminder.evidenceMonths.join(", ")}.
                  {reminder.status === "pending" && " A submission exists but is still pending; this is not treated as absent."}
                  {reminder.status === "rejected" && " A submission was rejected; this is not treated as absent."}
                  {reminder.status === "missing" && " Review the source before recording anything."}
                </p>
              </div>
            ))}
            {!visibleReminders.length && (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No expense reminders for this month.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
