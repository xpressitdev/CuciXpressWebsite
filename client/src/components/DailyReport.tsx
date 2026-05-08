// DailyReport — cashier-facing end-of-shift sales summary.
//
// Replaces the old "Reports" button that deep-linked into /admin (the
// admin surface is now off-limits to cashiers). Pulls totals from the
// staff's currently-open shift via /api/pos/shifts/current and renders
// them in the exact format used on the paper staff sales report:
//
//   Float Balance
//   Total Semua Sales Hari Ini (incl refund)
//   Refund
//   Bank Transfer / Card+Pocket+Ding / Cash Sales / etc
//   Expenses (cashier inputs, optional)
//   Total Cash in Hand = Cash Sales − Expenses
//
// One "Copy report" button puts a plain-text version on the clipboard
// so the cashier can paste it into WhatsApp for owner review.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Copy, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type PaymentBreakdown = {
  payment_method: string;
  sales_cents: number; sales_count: number;
  refund_cents: number; refund_count: number;
};

type Totals = {
  breakdown: PaymentBreakdown[];
  sales_cents: number; sales_count: number;
  refund_cents: number; refund_count: number;
  net_sales_cents: number;
  cash_sales_cents: number;
  cash_refund_cents: number;
  expected_cash_cents: number;
};

type ShiftRow = {
  id: number;
  branch_id: number;
  opened_by_staff_id: string;
  opening_float_cents: number;
  opening_note: string | null;
  status: "open" | "closed";
  opened_at: string;
};

type CurrentResponse = { shift: ShiftRow | null; totals?: Totals };

// Group payment methods the same way the paper report does so cashiers
// don't have to mentally re-bucket. "Card/Pocket/Ding" lumps together
// every electronic non-bank-transfer method (matches the example image).
const CARD_POCKET_DING = new Set([
  "card", "qr_code", "baiduri_pay", "quick_pay",
]);

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  qr_code: "QR Code",
  baiduri_pay: "Baiduri Pay",
  quick_pay: "Quick Pay",
  subscription: "Subscription",
  voucher: "Voucher",
};

const formatBND = (cents: number) =>
  `B$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const parseBND = (str: string): number | null => {
  const cleaned = str.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
};

interface DailyReportProps {
  branchName: string | null;
}

export default function DailyReport({ branchName }: DailyReportProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expensesStr, setExpensesStr] = useState("");
  const [notes, setNotes] = useState("");

  // Reuse the same endpoint ShiftBar polls — server already aggregates
  // sales/refunds per payment method for the current open shift.
  const { data, isLoading, isFetching } = useQuery<CurrentResponse>({
    queryKey: ["/api/pos/shifts/current"],
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });
  const shift = data?.shift ?? null;
  const totals = data?.totals;

  // Bucket the breakdown the way the paper report wants it.
  const buckets = useMemo(() => {
    const b = {
      bank_transfer: 0,
      card_pocket_ding: 0,
      cash: 0,
      other: 0,
    };
    if (!totals) return b;
    for (const r of totals.breakdown) {
      const net = r.sales_cents - r.refund_cents;
      if (r.payment_method === "bank_transfer") b.bank_transfer += net;
      else if (r.payment_method === "cash") b.cash += net;
      else if (CARD_POCKET_DING.has(r.payment_method)) b.card_pocket_ding += net;
      else b.other += net;
    }
    return b;
  }, [totals]);

  const expensesCents = parseBND(expensesStr);
  const expensesValid = expensesCents !== null;
  const cashInHand = totals
    ? buckets.cash - (expensesCents ?? 0)
    : 0;

  const buildPlainText = (): string => {
    if (!shift || !totals) return "";
    const dt = new Date(shift.opened_at);
    const dateStr = dt.toLocaleDateString("en-GB", { timeZone: "Asia/Brunei" });
    const timeStr = dt.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Brunei",
    });
    const exp = expensesCents ?? 0;
    const lines: string[] = [];
    lines.push(`Cuci Xpress Branch: ${branchName ?? "—"}`);
    lines.push(`Date & Time: ${dateStr} ${timeStr}`);
    lines.push(``);
    lines.push(`Float Balance: ${formatBND(shift.opening_float_cents)}`);
    lines.push(`Total Semua Sales Hari Ini (incl refund): ${formatBND(totals.sales_cents)}`);
    lines.push(`Refund: ${formatBND(totals.refund_cents)}`);
    lines.push(`Bank Transfer: ${formatBND(buckets.bank_transfer)}`);
    lines.push(`Total Card/Pocket/Ding Sales: ${formatBND(buckets.card_pocket_ding)}`);
    lines.push(`Total Cash Sales: ${formatBND(buckets.cash)}`);
    if (buckets.other > 0) lines.push(`Other (subscription/voucher): ${formatBND(buckets.other)}`);
    lines.push(`Expenses: ${formatBND(exp)}`);
    lines.push(`Total Cash in Hand (Cash Sales − Expenses): ${formatBND(buckets.cash - exp)}`);
    if (notes.trim()) {
      lines.push(``);
      lines.push(`Notes: ${notes.trim()}`);
    }
    return lines.join("\n");
  };

  const copyReport = async () => {
    const txt = buildPlainText();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      toast({ title: "Copied", description: "Paste into WhatsApp to send." });
    } catch {
      // Fallback for older browsers / iframe sandboxing.
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* noop */ }
      document.body.removeChild(ta);
      toast({ title: "Copied", description: "Paste into WhatsApp to send." });
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="cuci-cta bg-white text-gray-900 px-4 py-2 rounded-full inline-flex items-center gap-2 text-sm"
        data-testid="button-pos-daily-report"
      >
        <ClipboardList className="w-4 h-4" />
        Daily report
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="cuci-card border-2 border-black sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="cuci-eyebrow">End-of-shift report</div>
            <DialogTitle className="text-2xl font-extrabold tracking-tight">
              Daily <span className="text-cuci-primary">report</span>
            </DialogTitle>
            <DialogDescription>
              Live totals for your current shift. Add today's expenses, then
              copy the report and send it to the owner on WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="py-8 flex justify-center text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !shift || !totals ? (
            <div className="py-6 text-center text-sm text-gray-600">
              <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-amber-500" />
              No open shift. Open your shift first to see today's totals.
            </div>
          ) : (
            <div className="space-y-4 py-2 text-sm">
              <div className="text-xs text-gray-600 flex items-center justify-between">
                <span>Branch: <span className="font-semibold text-gray-900">{branchName ?? "—"}</span></span>
                <span>
                  Opened{" "}
                  {new Date(shift.opened_at).toLocaleString("en-GB", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                    timeZone: "Asia/Brunei",
                  })}
                </span>
              </div>

              {/* Sales summary in the same order as the paper report.
                  Net values per bucket (sales − refunds for that method). */}
              <div className="border-2 border-black rounded-md divide-y divide-gray-200 overflow-hidden">
                <Row label="Float Balance" value={formatBND(shift.opening_float_cents)} />
                <Row
                  label="Total Semua Sales Hari Ini (incl refund)"
                  value={formatBND(totals.sales_cents)}
                  hint={`${totals.sales_count} order(s)`}
                />
                <Row
                  label="Refund"
                  value={formatBND(totals.refund_cents)}
                  emphasis={totals.refund_cents > 0 ? "warn" : undefined}
                  hint={totals.refund_count > 0 ? `${totals.refund_count} refund(s)` : undefined}
                />
                <Row label="Bank Transfer" value={formatBND(buckets.bank_transfer)} />
                <Row label="Total Card/Pocket/Ding Sales" value={formatBND(buckets.card_pocket_ding)} />
                <Row label="Total Cash Sales" value={formatBND(buckets.cash)} />
                {buckets.other > 0 && (
                  <Row label="Other (subscription / voucher)" value={formatBND(buckets.other)} />
                )}
              </div>

              {/* Expenses input + cash in hand. Expenses live only in this
                  modal — we don't persist them server-side yet (paper-only
                  in the current process). */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">
                  Expenses (kalau ada)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={expensesStr}
                  onChange={(e) => setExpensesStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full border-2 border-black rounded-md px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-cuci-primary"
                  data-testid="input-daily-expenses"
                />
                {!expensesValid && (
                  <p className="text-xs text-red-600">Enter a valid amount or leave blank.</p>
                )}
              </div>

              <div className="border-2 border-black rounded-md p-3 bg-gradient-to-br from-purple-50 to-orange-50">
                <div className="flex items-center justify-between text-base font-bold">
                  <span>Total Cash in Hand</span>
                  <span className="tabular-nums">{formatBND(cashInHand)}</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Cash Sales {formatBND(buckets.cash)} − Expenses {formatBND(expensesCents ?? 0)}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">
                  Notes / Highlights <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Makluman: balas dari customer…"
                  rows={3}
                  className="w-full border-2 border-black rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cuci-primary"
                  data-testid="input-daily-notes"
                />
              </div>

              {isFetching && (
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Refreshing…
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <button
              onClick={() => setOpen(false)}
              className="cuci-cta bg-white text-gray-900 px-5 py-2 rounded-full text-sm"
              data-testid="button-daily-report-close"
            >
              Close
            </button>
            <button
              onClick={copyReport}
              disabled={!shift || !totals || !expensesValid}
              className="cuci-cta bg-cuci-primary text-white px-5 py-2 rounded-full text-sm inline-flex items-center gap-2 disabled:opacity-60"
              data-testid="button-daily-report-copy"
            >
              <Copy className="w-4 h-4" />
              Copy report
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label, value, hint, emphasis,
}: {
  label: string; value: string; hint?: string; emphasis?: "warn";
}) {
  return (
    <div className="px-3 py-2 flex items-center justify-between">
      <div>
        <div className="font-semibold text-gray-900">{label}</div>
        {hint && <div className="text-xs text-gray-500">{hint}</div>}
      </div>
      <div className={`tabular-nums font-semibold ${emphasis === "warn" ? "text-red-700" : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}
