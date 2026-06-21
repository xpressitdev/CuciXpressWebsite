// DailyReport — cashier-facing end-of-shift sales summary.
//
// Replaces the old "Reports" button that deep-linked into /admin (the
// admin surface is now off-limits to cashiers). Pulls totals from the
// staff's currently-open shift via /api/pos/shifts/current and renders
// them in a layout inspired by the reference POS print-current-shift
// view + the paper report the owner reviews on WhatsApp:
//
//   Header:           Store, Cashier, Shift Start, Shift End
//   Items:            Sold, Refunded, After Refunds
//   Cash Management:  Starting Cash, Cash Payments, Cash Refunds,
//                     Paid In (Income), Paid Out (Expense),
//                     Expected Cash Amount
//   Sales Summary:    per payment method — Sale / Refunds / Total
//   WhatsApp Summary: paper-report buckets the owner expects
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
  qr_provider?: string | null;
  sales_cents: number; sales_count: number;
  refund_cents: number; refund_count: number;
  mdr_bps?: number;
  mdr_fee_cents?: number;
};

type Totals = {
  breakdown: PaymentBreakdown[];
  sales_cents: number; sales_count: number;
  refund_cents: number; refund_count: number;
  net_sales_cents: number;
  mdr_fee_cents?: number;
  net_after_fees_cents?: number;
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

// Paper-report buckets — the owner's WhatsApp summary lumps every
// electronic non-bank-transfer method together as "Card/Pocket/Ding".
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

const PROVIDER_LABELS: Record<string, string> = {
  progresif_ding: "Progresif Ding",
  pocket_pay_qr: "Pocket QR",
  pocket_pay: "Website cucixpress.com (Web Pocket QR)",
};

// Rows are grouped per (payment_method, qr_provider), so a friendly label and
// a unique React key must account for the provider too.
const rowLabel = (r: PaymentBreakdown): string =>
  r.qr_provider
    ? PROVIDER_LABELS[r.qr_provider] ?? r.qr_provider.replace(/_/g, " ")
    : PAYMENT_LABELS[r.payment_method] ?? r.payment_method;
const rowKey = (r: PaymentBreakdown): string =>
  `${r.payment_method}|${r.qr_provider ?? ""}`;

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

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Brunei",
  });

interface DailyReportProps {
  branchName: string | null;
  staffName: string | null;
  branchId?: number | null;
  // Owner/manager: read the SELECTED branch's open shift (any opener), so the
  // report follows whichever branch they pick rather than their own shift.
  canManage?: boolean;
}

export default function DailyReport({ branchName, staffName, branchId = null, canManage = false }: DailyReportProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [paidInStr, setPaidInStr] = useState("");
  const [paidOutStr, setPaidOutStr] = useState("");
  const [notes, setNotes] = useState("");

  // Reuse the same endpoint ShiftBar polls — server already aggregates
  // sales/refunds per payment method for the current open shift.
  const { data, isLoading, isFetching } = useQuery<CurrentResponse>({
    queryKey: ["/api/pos/shifts/current", canManage ? branchId : null],
    enabled: open,
    refetchInterval: open ? 30_000 : false,
    queryFn: async () => {
      const url =
        canManage && branchId !== null
          ? `/api/pos/shifts/current?branch_id=${branchId}`
          : "/api/pos/shifts/current";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });
  const shift = data?.shift ?? null;
  const totals = data?.totals;

  // Paper-report buckets so we can also print the owner-friendly summary.
  const buckets = useMemo(() => {
    const b = { bank_transfer: 0, card_pocket_ding: 0, cash: 0, other: 0 };
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

  // Sort breakdown rows for the per-method "Sales Summary" — cash and
  // bank transfer first (most common), then everything else alphabetical.
  const sortedBreakdown = useMemo(() => {
    if (!totals) return [];
    const order: Record<string, number> = {
      cash: 1, bank_transfer: 2, card: 3, qr_code: 4,
      baiduri_pay: 5, quick_pay: 6, subscription: 7, voucher: 8,
    };
    return [...totals.breakdown].sort(
      (a, b) =>
        (order[a.payment_method] ?? 99) - (order[b.payment_method] ?? 99) ||
        (a.qr_provider ?? "").localeCompare(b.qr_provider ?? ""),
    );
  }, [totals]);

  const mdrFeeCents = totals?.mdr_fee_cents ?? 0;
  const netAfterFees =
    totals?.net_after_fees_cents ??
    (totals ? totals.net_sales_cents - mdrFeeCents : 0);

  const paidInCents = parseBND(paidInStr);
  const paidOutCents = parseBND(paidOutStr);
  const paidInValid = paidInCents !== null;
  const paidOutValid = paidOutCents !== null;

  // Expected Cash Amount = Starting Float + Cash Payments − Cash Refunds
  //                       + Paid In − Paid Out
  // (server already does float + cash_sales − cash_refunds; we add the
  // two cashier-entered movements here.)
  const expectedCash = totals
    ? totals.expected_cash_cents + (paidInCents ?? 0) - (paidOutCents ?? 0)
    : 0;
  const cashInHand = totals
    ? buckets.cash + (paidInCents ?? 0) - (paidOutCents ?? 0)
    : 0;

  const buildPlainText = (): string => {
    if (!shift || !totals) return "";
    const exp = paidOutCents ?? 0;
    const inc = paidInCents ?? 0;
    const lines: string[] = [];
    lines.push(`*Cuci Xpress — End of Shift*`);
    lines.push(`Store: ${branchName ?? "—"}`);
    lines.push(`Cashier: ${staffName ?? "—"}`);
    lines.push(`Shift Start: ${fmtDateTime(shift.opened_at)}`);
    lines.push(`Shift End: ${fmtDateTime(new Date().toISOString())}`);
    lines.push(``);
    lines.push(`— Items —`);
    lines.push(`No. of Sold Items: ${totals.sales_count}`);
    lines.push(`No. of Refunded Items: ${totals.refund_count}`);
    lines.push(`Total After Refunds: ${totals.sales_count - totals.refund_count}`);
    lines.push(``);
    lines.push(`— Cash Management —`);
    lines.push(`Starting Cash: ${formatBND(shift.opening_float_cents)}`);
    lines.push(`Cash Payments: ${formatBND(totals.cash_sales_cents)}`);
    lines.push(`Cash Refunds: ${formatBND(totals.cash_refund_cents)}`);
    lines.push(`Paid In (Income): ${formatBND(inc)}`);
    lines.push(`Paid Out (Expense): ${formatBND(exp)}`);
    lines.push(`Expected Cash Amount: ${formatBND(expectedCash)}`);
    lines.push(``);
    lines.push(`— Sales Summary —`);
    for (const r of sortedBreakdown) {
      const label = rowLabel(r);
      lines.push(`${label} Sale: ${formatBND(r.sales_cents)} (${r.sales_count})`);
      lines.push(`${label} Refunds: ${formatBND(r.refund_cents)} (${r.refund_count})`);
      lines.push(`${label} Total: ${formatBND(r.sales_cents - r.refund_cents)}`);
      if (r.mdr_fee_cents && r.mdr_fee_cents > 0) {
        lines.push(`${label} Fee (${((r.mdr_bps ?? 0) / 100).toFixed(2)}%): -${formatBND(r.mdr_fee_cents)}`);
      }
    }
    lines.push(``);
    lines.push(`— WhatsApp Summary —`);
    lines.push(`Float Balance: ${formatBND(shift.opening_float_cents)}`);
    lines.push(`Total Semua Sales (incl refund): ${formatBND(totals.sales_cents)}`);
    lines.push(`Refund: ${formatBND(totals.refund_cents)}`);
    lines.push(`Bank Transfer: ${formatBND(buckets.bank_transfer)}`);
    lines.push(`Total Card/Pocket/Ding: ${formatBND(buckets.card_pocket_ding)}`);
    lines.push(`Total Cash Sales: ${formatBND(buckets.cash)}`);
    if (buckets.other > 0) lines.push(`Other (subscription/voucher): ${formatBND(buckets.other)}`);
    lines.push(`Net Sales (after refunds): ${formatBND(totals.net_sales_cents)}`);
    lines.push(`Transaction Fees (MDR): -${formatBND(mdrFeeCents)}`);
    lines.push(`Net After Fees: ${formatBND(netAfterFees)}`);
    lines.push(`Expenses: ${formatBND(exp)}`);
    lines.push(`Total Cash in Hand: ${formatBND(cashInHand)}`);
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
        <DialogContent className="cuci-card border-2 border-black sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="cuci-eyebrow">End-of-shift report</div>
            <DialogTitle className="text-2xl font-extrabold tracking-tight">
              Daily <span className="text-cuci-primary">report</span>
            </DialogTitle>
            <DialogDescription>
              Live totals for your current shift. Add Paid In / Paid Out
              if any, then copy the report and send it to the owner on
              WhatsApp.
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
            <div className="space-y-5 py-2 text-sm">
              {/* Header — Store / Cashier / Shift Start / Shift End. */}
              <Section title="Shift">
                <Row label="Store" value={branchName ?? "—"} />
                <Row label="Cashier" value={staffName ?? "—"} />
                <Row label="Shift Start" value={fmtDateTime(shift.opened_at)} />
                <Row label="Shift End" value="— (still open)" emphasis="muted" />
              </Section>

              {/* Item counts. */}
              <Section title="Items">
                <Row label="No. of Sold Items" value={String(totals.sales_count)} />
                <Row
                  label="No. of Refunded Items"
                  value={String(totals.refund_count)}
                  emphasis={totals.refund_count > 0 ? "warn" : undefined}
                />
                <Row
                  label="Total No. of Items After Refunds"
                  value={String(totals.sales_count - totals.refund_count)}
                  bold
                />
              </Section>

              {/* Cash management — drawer reconciliation. Paid In / Out
                  are cashier-entered on this screen (not persisted). */}
              <Section title="Cash Management">
                <Row label="Starting Cash" value={formatBND(shift.opening_float_cents)} />
                <Row label="Cash Payments" value={formatBND(totals.cash_sales_cents)} />
                <Row
                  label="Cash Refunds"
                  value={formatBND(totals.cash_refund_cents)}
                  emphasis={totals.cash_refund_cents > 0 ? "warn" : undefined}
                />
                <InputRow
                  label="Paid In (Income)"
                  value={paidInStr}
                  onChange={setPaidInStr}
                  invalid={!paidInValid}
                  testId="input-daily-paid-in"
                />
                <InputRow
                  label="Paid Out (Expense)"
                  value={paidOutStr}
                  onChange={setPaidOutStr}
                  invalid={!paidOutValid}
                  testId="input-daily-paid-out"
                />
                <Row
                  label="Expected Cash Amount"
                  value={formatBND(expectedCash)}
                  bold
                />
              </Section>

              {/* Per-payment-method breakdown — Sale / Refunds / Total. */}
              <Section title="Sales Summary">
                {sortedBreakdown.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-500">No sales yet.</div>
                ) : (
                  sortedBreakdown.map((r) => {
                    const label = rowLabel(r);
                    return (
                      <div key={rowKey(r)} className="px-3 py-2">
                        <div className="text-xs uppercase tracking-wide font-bold text-gray-700 mb-1">
                          {label} Payments
                        </div>
                        <MiniRow
                          label={`${label} Sale`}
                          value={formatBND(r.sales_cents)}
                          hint={r.sales_count > 0 ? `${r.sales_count} order(s)` : undefined}
                        />
                        <MiniRow
                          label={`${label} Refunds`}
                          value={formatBND(r.refund_cents)}
                          hint={r.refund_count > 0 ? `${r.refund_count} refund(s)` : undefined}
                          emphasis={r.refund_cents > 0 ? "warn" : undefined}
                        />
                        <MiniRow
                          label={`${label} Total`}
                          value={formatBND(r.sales_cents - r.refund_cents)}
                          bold
                        />
                        {!!r.mdr_fee_cents && r.mdr_fee_cents > 0 && (
                          <MiniRow
                            label={`${label} Fee (${((r.mdr_bps ?? 0) / 100).toFixed(2)}%)`}
                            value={`-${formatBND(r.mdr_fee_cents)}`}
                            emphasis="warn"
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </Section>

              {/* Net after fees — the headline number the owner cares about. */}
              <div className="border-2 border-black rounded-md p-3 bg-gradient-to-br from-emerald-50 to-teal-50">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-800">Net Sales (after refunds)</span>
                  <span className="tabular-nums font-semibold">{formatBND(totals.net_sales_cents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-800">Transaction Fees (MDR)</span>
                  <span className="tabular-nums font-semibold text-red-700">−{formatBND(mdrFeeCents)}</span>
                </div>
                <div className="flex items-center justify-between text-lg font-extrabold mt-1 pt-1 border-t-2 border-black">
                  <span>Net After Fees</span>
                  <span className="tabular-nums text-emerald-700" data-testid="text-daily-net-after-fees">
                    {formatBND(netAfterFees)}
                  </span>
                </div>
              </div>

              {/* Cash in Hand — what the drawer should physically hold. */}
              <div className="border-2 border-black rounded-md p-3 bg-gradient-to-br from-purple-50 to-orange-50">
                <div className="flex items-center justify-between text-base font-bold">
                  <span>Total Cash in Hand</span>
                  <span className="tabular-nums">{formatBND(cashInHand)}</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Cash Sales {formatBND(buckets.cash)} + Paid In {formatBND(paidInCents ?? 0)} − Paid Out {formatBND(paidOutCents ?? 0)}
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
              disabled={!shift || !totals || !paidInValid || !paidOutValid}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-1.5">
        {title}
      </div>
      <div className="border-2 border-black rounded-md divide-y divide-gray-200 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({
  label, value, hint, emphasis, bold,
}: {
  label: string; value: string; hint?: string;
  emphasis?: "warn" | "muted"; bold?: boolean;
}) {
  const valueColor =
    emphasis === "warn" ? "text-red-700"
    : emphasis === "muted" ? "text-gray-400"
    : "text-gray-900";
  return (
    <div className={`px-3 py-2 flex items-center justify-between ${bold ? "bg-gray-50" : ""}`}>
      <div>
        <div className={`${bold ? "font-bold" : "font-semibold"} text-gray-900`}>{label}</div>
        {hint && <div className="text-xs text-gray-500">{hint}</div>}
      </div>
      <div className={`tabular-nums ${bold ? "font-bold" : "font-semibold"} ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

function MiniRow({
  label, value, hint, emphasis, bold,
}: {
  label: string; value: string; hint?: string;
  emphasis?: "warn"; bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <div className="flex items-center gap-2">
        <span className={bold ? "font-bold text-gray-900" : "text-gray-700"}>{label}</span>
        {hint && <span className="text-xs text-gray-500">· {hint}</span>}
      </div>
      <span
        className={`tabular-nums ${bold ? "font-bold" : ""} ${
          emphasis === "warn" ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function InputRow({
  label, value, onChange, invalid, testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  testId: string;
}) {
  return (
    <div className="px-3 py-2 flex items-center justify-between gap-3">
      <div className="font-semibold text-gray-900">{label}</div>
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-500">B$</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0.00"
            className={`w-28 border-2 ${invalid ? "border-red-500" : "border-black"} rounded-md px-2 py-1 text-right text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-cuci-primary`}
            data-testid={testId}
          />
        </div>
        {invalid && (
          <span className="text-xs text-red-600 mt-0.5">Invalid amount</span>
        )}
      </div>
    </div>
  );
}
