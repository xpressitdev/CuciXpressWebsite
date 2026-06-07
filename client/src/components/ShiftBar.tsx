// ShiftBar — Phase 8 cashier shift open/close UI.
//
// Self-contained: owns its own /api/pos/shifts/current query, open/close
// mutations, and modal state. The cashier sees one pill in the POS header:
//
//   - No open shift     → amber "Open shift" CTA   → opens float modal
//   - Open shift        → green "Shift open · B$X" → opens close modal
//
// Variance is computed server-side at close time; we just preview a live
// expected value from the running totals so cashiers can sanity-check
// before declaring counted cash.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlayCircle, StopCircle, Banknote, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  pocket_pay: "Pocket Web",
};

// Breakdown rows are grouped per (payment_method, qr_provider); label and React
// key must include the provider so each wallet shows separately.
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
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
};

const formatElapsed = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

interface ShiftBarProps {
  branchId: number | null;
  branchName: string | null;
  enabled: boolean;
  // Owner/manager: resolve + close the SELECTED branch's shift (any opener),
  // not just the logged-in user's own shift.
  canManage?: boolean;
}

export default function ShiftBar({ branchId, branchName, enabled, canManage = false }: ShiftBarProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Modals
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [floatStr, setFloatStr] = useState("");
  const [openNote, setOpenNote] = useState("");
  const [countedStr, setCountedStr] = useState("");
  const [closeNote, setCloseNote] = useState("");

  // Poll the running shift every 30s so the expected-cash preview stays
  // fresh while the cashier rings up orders.
  const { data, isLoading } = useQuery<CurrentResponse>({
    queryKey: ["/api/pos/shifts/current", canManage ? branchId : null],
    enabled,
    refetchInterval: 30_000,
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

  const openMutation = useMutation({
    mutationFn: async (vars: {
      branch_id: number; opening_float_cents: number; opening_note: string | null;
    }) => {
      const res = await apiRequest("POST", "/api/pos/shifts/open", vars);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos/shifts/current"] });
      toast({ title: "Shift opened", description: "Drawer ready." });
      setOpenModal(false);
      setFloatStr("");
      setOpenNote("");
    },
    onError: (err: any) => {
      const code = String(err?.message ?? "");
      const friendly = code.includes("shift_already_open")
        ? "You already have an open shift. Close it first."
        : "Could not open shift.";
      toast({ title: "Open failed", description: friendly, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (vars: {
      counted_cents: number; closing_note: string | null; branch_id?: number;
    }) => {
      const res = await apiRequest("POST", "/api/pos/shifts/close", vars);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos/shifts/current"] });
      const variance = data?.shift?.closing_variance_cents ?? 0;
      const variantText = variance === 0
        ? "Drawer balanced."
        : variance > 0
          ? `Over by ${formatBND(variance)}.`
          : `Short by ${formatBND(-variance)}.`;
      toast({
        title: "Shift closed",
        description: variantText,
        variant: variance === 0 ? "default" : "destructive",
      });
      setCloseModal(false);
      setCountedStr("");
      setCloseNote("");
    },
    onError: (err: any) => {
      const code = String(err?.message ?? "");
      const friendly = code.includes("no_open_shift")
        ? "No open shift to close."
        : "Could not close shift.";
      toast({ title: "Close failed", description: friendly, variant: "destructive" });
    },
  });

  if (!enabled || isLoading) {
    return null;
  }

  // Live preview for the close modal — read from `totals` if shift is open.
  const counted = parseBND(countedStr);
  const expected = totals?.expected_cash_cents ?? 0;
  const variancePreview = counted !== null ? counted - expected : null;

  const submitOpen = () => {
    if (branchId === null) return;
    const cents = parseBND(floatStr);
    if (cents === null) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    openMutation.mutate({
      branch_id: branchId,
      opening_float_cents: cents,
      opening_note: openNote.trim() || null,
    });
  };

  const submitClose = () => {
    if (counted === null) {
      toast({ title: "Enter the counted cash", variant: "destructive" });
      return;
    }
    closeMutation.mutate({
      counted_cents: counted,
      closing_note: closeNote.trim() || null,
      ...(canManage && branchId !== null ? { branch_id: branchId } : {}),
    });
  };

  return (
    <>
      {shift ? (
        <button
          onClick={() => setCloseModal(true)}
          className="cuci-cta bg-white text-gray-900 px-4 py-2 rounded-full inline-flex items-center gap-2 text-sm whitespace-nowrap"
          data-testid="button-shift-pill-open"
          title={`Open since ${new Date(shift.opened_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Brunei" })}`}
        >
          <span className="cuci-live-dot" />
          <span className="font-semibold">Shift open</span>
          <span className="text-gray-400">·</span>
          <span>Float {formatBND(shift.opening_float_cents)}</span>
          <span className="text-gray-400">·</span>
          <span>{formatElapsed(shift.opened_at)}</span>
        </button>
      ) : (
        <button
          onClick={() => setOpenModal(true)}
          disabled={branchId === null}
          className="cuci-cta bg-cuci-secondary text-black px-4 py-2 rounded-full inline-flex items-center gap-2 text-sm whitespace-nowrap font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="button-shift-pill-closed"
        >
          <PlayCircle className="w-4 h-4" />
          Open shift
        </button>
      )}

      {/* --- Open shift modal ---------------------------------------- */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="cuci-card border-2 border-black sm:max-w-md">
          <DialogHeader>
            <div className="cuci-eyebrow">Cashier · {branchName ?? "Branch"}</div>
            <DialogTitle className="text-2xl font-extrabold tracking-tight">
              Open <span className="text-cuci-primary">shift</span>
            </DialogTitle>
            <DialogDescription>
              Count the cash already in the drawer and enter the total. This
              becomes your starting float for reconciliation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">
                Opening float (BND)
              </label>
              <div className="relative">
                <Banknote className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  inputMode="decimal"
                  value={floatStr}
                  onChange={(e) => setFloatStr(e.target.value)}
                  placeholder="50.00"
                  className="w-full border-2 border-black rounded-md pl-9 pr-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-cuci-primary"
                  data-testid="input-shift-opening-float"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">
                Note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={openNote}
                onChange={(e) => setOpenNote(e.target.value)}
                placeholder="e.g. Morning shift, change requested from manager"
                rows={2}
                className="w-full border-2 border-black rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cuci-primary"
                data-testid="input-shift-opening-note"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setOpenModal(false)}
              className="cuci-cta bg-white text-gray-900 px-5 py-2 rounded-full text-sm"
              data-testid="button-shift-open-cancel"
            >
              Cancel
            </button>
            <button
              onClick={submitOpen}
              disabled={openMutation.isPending}
              className="cuci-cta bg-cuci-primary text-white px-5 py-2 rounded-full text-sm inline-flex items-center gap-2 disabled:opacity-60"
              data-testid="button-shift-open-confirm"
            >
              {openMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              Open shift
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Close shift modal --------------------------------------- */}
      <Dialog open={closeModal} onOpenChange={setCloseModal}>
        <DialogContent className="cuci-card border-2 border-black sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="cuci-eyebrow">End of shift</div>
            <DialogTitle className="text-2xl font-extrabold tracking-tight">
              Close <span className="text-cuci-primary">shift</span>
            </DialogTitle>
            <DialogDescription>
              Count the cash in the drawer and enter the total. The system
              compares against expected and flags any over/short.
            </DialogDescription>
          </DialogHeader>

          {totals && shift && (
            <div className="space-y-4 py-2">
              {/* Sales breakdown */}
              <div className="border-2 border-black rounded-md overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b-2 border-black">
                  <div className="cuci-eyebrow">Shift totals</div>
                </div>
                <div className="divide-y divide-gray-200 text-sm">
                  {totals.breakdown.length === 0 ? (
                    <div className="px-3 py-3 text-gray-500 italic">No orders yet.</div>
                  ) : (
                    totals.breakdown.map((row) => {
                      const net = row.sales_cents - row.refund_cents;
                      return (
                        <div key={rowKey(row)} className="px-3 py-2 flex items-center justify-between">
                          <span className="font-semibold">
                            {rowLabel(row)}
                          </span>
                          <span className="tabular-nums">
                            {formatBND(net)}
                            {row.refund_count > 0 && (
                              <span className="text-xs text-red-600 ml-1">
                                (−{formatBND(row.refund_cents)} refund)
                              </span>
                            )}
                            {!!row.mdr_fee_cents && row.mdr_fee_cents > 0 && (
                              <span className="text-xs text-amber-600 ml-1">
                                (−{formatBND(row.mdr_fee_cents)} fee)
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div className="px-3 py-2 flex items-center justify-between bg-gray-50 font-semibold">
                    <span>Net sales</span>
                    <span className="tabular-nums">{formatBND(totals.net_sales_cents)}</span>
                  </div>
                  {(totals.mdr_fee_cents ?? 0) > 0 && (
                    <div className="px-3 py-2 flex items-center justify-between text-amber-700">
                      <span>− Transaction fees (MDR)</span>
                      <span className="tabular-nums">−{formatBND(totals.mdr_fee_cents ?? 0)}</span>
                    </div>
                  )}
                  <div className="px-3 py-2 flex items-center justify-between bg-emerald-50 font-bold text-emerald-800">
                    <span>Net after fees</span>
                    <span className="tabular-nums" data-testid="text-shift-net-after-fees">
                      {formatBND(totals.net_after_fees_cents ?? (totals.net_sales_cents - (totals.mdr_fee_cents ?? 0)))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expected cash */}
              <div className="border-2 border-black rounded-md p-3 space-y-1.5 text-sm bg-gradient-to-br from-purple-50 to-orange-50">
                <div className="flex items-center justify-between">
                  <span>Opening float</span>
                  <span className="tabular-nums font-semibold">{formatBND(shift.opening_float_cents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>+ Cash sales</span>
                  <span className="tabular-nums font-semibold">{formatBND(totals.cash_sales_cents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>− Cash refunds</span>
                  <span className="tabular-nums font-semibold">{formatBND(totals.cash_refund_cents)}</span>
                </div>
                <div className="flex items-center justify-between border-t-2 border-black pt-1.5 mt-1.5 text-base font-bold">
                  <span>Expected cash in drawer</span>
                  <span className="tabular-nums">{formatBND(totals.expected_cash_cents)}</span>
                </div>
              </div>

              {/* Counted input */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Counted cash (BND)
                </label>
                <div className="relative">
                  <Banknote className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={countedStr}
                    onChange={(e) => setCountedStr(e.target.value)}
                    placeholder={(totals.expected_cash_cents / 100).toFixed(2)}
                    className="w-full border-2 border-black rounded-md pl-9 pr-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-cuci-primary"
                    data-testid="input-shift-counted"
                    autoFocus
                  />
                </div>
                {variancePreview !== null && (
                  <div
                    className={`mt-2 text-sm font-semibold inline-flex items-center gap-1.5 ${
                      variancePreview === 0
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                    data-testid="text-variance-preview"
                  >
                    {variancePreview !== 0 && <AlertTriangle className="w-4 h-4" />}
                    {variancePreview === 0
                      ? "Balanced"
                      : variancePreview > 0
                        ? `Over by ${formatBND(variancePreview)}`
                        : `Short by ${formatBND(-variancePreview)}`}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="e.g. Float taken to bank, drawer locked"
                  rows={2}
                  className="w-full border-2 border-black rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cuci-primary"
                  data-testid="input-shift-closing-note"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <button
              onClick={() => setCloseModal(false)}
              className="cuci-cta bg-white text-gray-900 px-5 py-2 rounded-full text-sm"
              data-testid="button-shift-close-cancel"
            >
              Cancel
            </button>
            <button
              onClick={submitClose}
              disabled={closeMutation.isPending || counted === null}
              className="cuci-cta bg-cuci-primary text-white px-5 py-2 rounded-full text-sm inline-flex items-center gap-2 disabled:opacity-60"
              data-testid="button-shift-close-confirm"
            >
              {closeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
              Close shift
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
